# 전기분야 신입사원 교육

정적 HTML/JavaScript 교육 사이트입니다. 교육 홈은 `index.html`, 계통도 및 조작 연습은 `power.html`입니다.

## 실행

저장소를 ZIP으로 내려받아 압축을 풀고 `index.html`을 브라우저로 엽니다. HTML, CSS, JS 파일을 같은 폴더에 유지하세요. 별도 서버나 패키지 설치는 필요하지 않습니다.

조작 연습에서 52-R1 또는 52-R2를 선택하면 RUN 투입·개방 시퀀스, TEST 개별 조작, 보호 입력과 인터록을 연습할 수 있습니다. 상태 변경·출력·시간 경과는 조작 이력에 표시됩니다. 상세 적용 범위는 [R1 소스 기록](docs/52r1-source-logic.md)과 [R2 소스 기록](docs/52r2-source-logic.md)을 참조하세요. R2의 투입 명령 제한은 8초이며 UVR1은 표시·경보 전용입니다.

## 검증 및 배포 파일

```sh
node tests/ac-protection.test.js
node tests/r1-sequence.test.js
node tests/r2-sequence.test.js
python3 scripts/build_site.py
```

배포 산출물은 `_site/`에 만들어집니다. 사이트에 필요한 파일만 포함하며, 원본 계전기 프로젝트·도면·테스트·문서는 배포하지 않습니다.

## GitHub Pages

`.github/workflows/pages.yml`이 main 푸시와 수동 실행을 지원합니다. 로직 테스트가 성공한 뒤 사이트를 패키징하여 GitHub Pages에 배포합니다.

1. 저장소 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다. Pages가 비활성화되어 있으면 저장소 소유자가 처음 한 번 활성화해야 합니다.
2. **Actions → Publish education website**에서 최근 실행을 확인합니다. 최초 설정 후 재실행은 **Run workflow**를 사용합니다.
3. `deploy` 작업이 성공하면 GitHub Pages에서 제공하는 사이트 주소로 접속합니다.

기본 Actions 토큰은 이미 활성화된 Pages에 배포할 수 있지만 최초 활성화에 필요한 저장소 관리 권한은 제공하지 않습니다. 이 저장소는 별도 개인 토큰을 요구하거나 저장하지 않습니다.
