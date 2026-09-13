const assert=require('node:assert/strict');
const nav=require('../skin/blog-navigation.js');
const fs=require('node:fs');
for(const [input,expected] of [
 ['2026-09-13T00:00:00+09:00','9월 13일 (일)'],
 ['2026-09-07T00:00:00+09:00','9월 7일 (월)'],
 ['2026-01-01T00:00:00+09:00','1월 1일 (목)'],
 ['2025-12-31T00:00:00+09:00','12월 31일 (수)'],
 ['2024-02-29T00:00:00+09:00','2월 29일 (목)'],
 ['2026-02-29',''],['2026-13-01',''],['2026-04-31',''],['13',''],[undefined,'']
])assert.equal(nav.visitorDate(input),expected);
const rows=[{timestamp:'2026-09-12T00:00:00+09:00',count:31},{timestamp:'2026-09-13T00:00:00+09:00',count:0}];
function fixture(delayed=false){
 const listeners={},attributes={},ticks=[];
 const canvas={addEventListener:(name,fn)=>listeners[name]=fn,setAttribute:(name,value)=>attributes[name]=value};
 const chart={config:{options:{plugins:{tooltip:{enabled:false,callbacks:{footer:()=>''}},legend:{display:false}},scales:{x:{display:false}},interaction:{mode:'index',intersect:false}},data:{datasets:[{data:[31,0],pointHoverRadius:5}]}},update:mode=>ticks.push(mode)};
 const win={chartData:rows,Chart:{getChart:()=>delayed?null:chart},setInterval:fn=>{win.tick=fn;return 7;},clearInterval:id=>{win.cleared=id;}};
 return {canvas,chart,win,listeners,attributes,ticks,doc:{defaultView:win,getElementById:()=>canvas},ready:()=>{delayed=false;}};
}
const f=fixture();
const original=JSON.stringify(f.chart.config.data),scales=JSON.stringify(f.chart.config.options.scales);
nav.enhanceVisitorChart(f.doc);
const tip=f.chart.config.options.plugins.tooltip;
assert.equal(tip.enabled,true);assert.equal(tip.intersect,false);assert.equal(tip.mode,'index');
assert.equal(tip.callbacks.title([{dataIndex:0}]),'9월 12일');
assert.equal(tip.callbacks.title([{dataIndex:1}]),'9월 13일');
assert.equal(tip.callbacks.title([{dataIndex:99}]),'날짜 정보 없음');
assert.equal(tip.callbacks.label({formattedValue:'0'}),'');
assert.equal(tip.callbacks.label({formattedValue:'1,234'}),'');
assert.equal(tip.titleFont.size,10);assert.equal(tip.titleMarginBottom,0);
assert.equal(tip.xAlign,'center');
assert.equal(tip.yAlign({tooltip:{dataPoints:[{element:{y:40}}]}}),'top');
assert.equal(tip.yAlign({tooltip:{dataPoints:[{element:{y:90}}]}}),'bottom');
assert.equal(tip.yAlign({tooltip:{}}),'bottom');
assert.equal(tip.callbacks.footer(),'');
assert.equal(JSON.stringify(f.chart.config.data),original);
assert.equal(JSON.stringify(f.chart.config.options.scales),scales);
assert.match(f.attributes['aria-label'],/9월 13일 \(일\) 방문자 0/);
nav.enhanceVisitorChart(f.doc);f.listeners.pointerenter();f.listeners.touchstart();
assert.deepEqual(f.ticks,['none']);
f.win.chartData=[...rows.slice(0,1),{timestamp:'2026-10-01T00:00:00+09:00',count:0}];
assert.equal(tip.callbacks.title([{dataIndex:1}]),'10월 1일');
const late=fixture(true);nav.enhanceVisitorChart(late.doc);assert(late.win.tick);
late.ready();late.win.tick();assert.equal(late.win.cleared,7);assert.equal(late.chart.config.options.plugins.tooltip.enabled,true);
const missing=fixture(true);nav.enhanceVisitorChart(missing.doc);for(let i=0;i<40;i++)missing.win.tick();assert.equal(missing.win.cleared,7);
nav.enhanceVisitorChart({defaultView:{},getElementById:()=>null});
assert.equal(fs.readFileSync('skin/blog-navigation.js','utf8'),fs.readFileSync('docs/blog-navigation.js','utf8'));
console.log('PASS: visitor dates, timezone/calendar boundaries, zero counts, delayed load, repeated init, native styling, accessible description, no-chart fallback');
