# 방문자 그래프 날짜 툴팁

## 변경 범위

- `#chartctx` 방문자 그래프에만 날짜와 방문자 수 툴팁을 활성화합니다.
- 티스토리에서 이미 내려주는 `chartData[].timestamp`를 사용합니다. 새로운 수집이나 네트워크 요청은 없습니다.
- 숫자/점의 X 위치를 기준으로 선택하므로 작은 점을 정확히 겨냥할 필요가 없습니다. 터치/클릭도 기존 Chart.js 이벤트를 사용합니다.
- 날짜는 `9월 13일 (일)` 형식이며, 독자의 로컬 시간대로 하루가 바뀌지 않도록 원본 날짜를 사용합니다.
- 툴팁의 자동 배치로 그래프 첫 점·마지막 점·최고점에서도 잘림을 피합니다.
- 기존 그래프·점 강조·수치·축 설정·아래 갱신 시각은 보존합니다. 무채색 툴팁을 사용합니다.
- Canvas의 접근성 설명에도 날짜별 방문자 수를 제공합니다.
- Chart.js가 늦게 초기화되면 제한된 재시도 및 Pointer/Touch 진입 시 연결하며, 그래프가 없는 페이지에서는 아무것도 하지 않습니다.

## 검증

- `node --check skin/blog-navigation.js` PASS.
- `node tests/visitor-chart.test.cjs` PASS: 정상 날짜, 월/연도 경계, 윤년, 잘못된 날짜, 0, 지연 초기화, 중복 초기화, 기존 옵션/데이터 보존.
- `node tests/navigation.test.cjs` PASS.
- `node tests/editorial.test.cjs` PASS.
- `git diff --check` PASS.
- `skin/blog-navigation.js`와 `docs/blog-navigation.js` 내용 동일.
- 실제 Chart.js 4.4.1 로컬 Fixture에서 마지막 점(9월 13일, 49)과 다크모드 최고점(9월 9일, 142)의 툴팁을 화면으로 확인했습니다.

## 근거

- 티스토리 공개 그래프 스크립트: https://t1.daumcdn.net/tistory_admin/lib/chartjs/4.4.1/chart.js
- 공식 Tooltip 설정: https://www.chartjs.org/docs/latest/configuration/tooltip.html

## 배포

배포 및 실제 블로그 확인 후 아래에 결과를 기록합니다. 다른 미완료 글·초안·보고서는 이 커밋에 포함하지 않습니다.
