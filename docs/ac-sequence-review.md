# AC 시퀀스 적용 기록

52-R1·52-R2·52-R3는 각각의 프로젝트 소스의 RUN 투입·개방 순차 조작, TEST 개별 조작, LOCAL/REMOTE 경로, 보호 접점과 타이머를 적용한다. 52-1은 52s1.src의 RUN/TEST 직접 조작과 HSCB 연동을 적용한다. 52-2·D1·D2·DB1·DB2·H1·H2·H3와 HT는 [압축파일의 실제 소스 접점망](station-logic-review.md)으로 교체했다. 제어전원/스프링이 정상인 교육 조건이며, 전체 자동 전원 절체·기계적 인터록·정정치 계산·DC 상세 보호는 포함하지 않는다.

`ac-protection.js`의 입력은 이미 동작한 계전 출력 접점이다. 따라서 OCR51 체크가 바로 반응하는 것은 정정 시간을 0초로 설정했다는 뜻이 아니다. 도면의 500 ms `TP_OCR50`, `TP_OCR51` 등은 경보 출력 쪽 펄스이며 보호요소의 동작 시간으로 쓰지 않았다.

도면 PDF 17개와 52r1·52r2·52r3·52s1 프로젝트 파일을 검토했으나 원본은 저장소에 게시하지 않았다. 아래 파일명은 사용자가 제공한 원본을 가리킨다. 각각 1페이지다.

## 초기 도면 검토 기록 (아래 D1·DB1·H1·HT 해석은 실제 소스 적용으로 대체)

| 도면 | 적용한 내용 | 자동 개방 |
| --- | --- | --- |
| 752-52R1 GCB1~4.pdf 및 **52r1.src 보호 로직** | PDF 기반 CX PERMIT: `(!R2_A || !R2_84X) && (!R3_A || !R3_84X) && !G86X`. 소스의 OCR50/51, OCGR50/51, OVR, UVR, G63CB2_F → G86X를 적용. 29X, 63G1, PTX, 29AL은 표시만 적용. TEST 89-R1 투입은 CB 개방 조건, 개방은 CB 투입 중에도 가능(사용자 확인). | 소스 구간 16의 `MANUAL_52TX OR AUTO_52TX OR G86X → CB1_52R1_OPEN`에 따라 **G86X 동작 시 52-R1 자동 개방**. |
| **52r2.src** | CX_PERMIT의 5개 소스 분기를 대조. RUN/TEST·LOCAL/REMOTE, 투입 제한 8초/개방 제한 10초. OCR50/51, OCGR50/51, OVR, G63CB2_F → G86X. UVR1은 표시·경보만. | G86X → CB1_52R2_OPEN. R1 상태·84X를 투입 허가에 연동하며 R1을 직접 트립시키지 않음. |
| **52r3.src** | 소스의 5개 투입 허가 분기와 6개 G86X 분기를 대조. RUN/TEST·LOCAL/REMOTE, 투입 8초/개방 10초. UVR1은 표시·경보만. R2_84X·R3_84X는 세 반에서 공유. 사용자 확인: TEST에서는 CB 투입 중 DS 개방 가능(투입은 차단). | G86X → CB1_52R3_OPEN. R1·R2의 실제 조작 상태를 투입 허가에 사용하며 다른 반을 직접 트립시키지 않음. |
| 752-52D1 GCB1~3.pdf | 52-DB1 개방 및 G86X 비동작 조건에서 투입. 수동 개방도 RUN + DB1 b접점 필요. OCR50/51, OCGR50/51, 87T_F, 29X_F, 63G2_F → 52D1_FAULT → G86X. | 확인된 G86X → TX 분기로 52-D1 개방. 수동 개방 제한은 보호 트립에 적용하지 않음. |
| 752-52DB1 VCB1~3.pdf | D1 a접점, G86X b접점 및 HT b접점의 직접 CX1 PERMIT 경로. OCR50/51, 27TX, D1_FAULT → 86X. `UVR1 && DB1_A`가 0.5초 유지되면 27T → 27TX. | 86X → TX1. D1 FAULT 수신 시 DB1 개방. DB1의 자체 OCR FAULT는 D1반에 경보만 전달하고 D1을 역방향 트립시키지 않음. |
| 752-52H1 VCB1~3.pdf | CX PERMIT: 89-H1 a, DB_27TX b, UVR1 b, 86X b. OCR50/51, SGR_F, DB_27TX → 86X. 89-H1은 52-H1 개방 중 조작. | 86X → TX1. DB1의 27TX 펄스를 같은 평가 단계에서 H1에 전달. H1의 UVR1 단독은 투입 억제이며 자체 트립 원인으로 추가하지 않음. |
| 752-52S1 GCB1~3.pdf 및 **52s1.src** | 소스 DI31_NEG_DS_A·DI36_HSCB_B·G86X 조건으로 RUN 투입. RUN 수동 개방은 HSCB_B, TEST는 개별 조작. OCR50/51, OCGR50/51, UVR1, 63G2_F, TR26TP, REC26TP, REC_FAULT, TP_HSCB_86X → G86X. HSCB_FAULT는 **즉시 1초 TP 펄스**. OVR·29AL은 비트립. | G86X 또는 TRIP_TEST1 → G52TX → CB1_52S1_OPEN. HSCB_CX_PERMIT와 HSCB_TRIP을 54-1에 연결. 전체 DC 보호는 아님. |
| 752-52HT VCB.pdf 및 752-52DB1 VCB1.pdf | HT 명령은 DB1반에서 발생. RUN CX2 PERMIT은 DB1 b접점과 DB2 b접점 병렬: `!DB1_A || !DB2_A`. | 자체 보호요소를 임의로 추가하지 않음. |

세 프로젝트 모두 사용자 확인에 따라 TEST에서는 CB 투입 중에도 DS 개방이 가능하다. TEST DS 투입은 CB 개방이 필요하며, RUN은 CB 개방 후 DS 개방 순서를 유지한다.

## 표시기억과 원인 신호

- 화면의 표시기억은 동작 사실을 남긴다. 일반 OCR 원인이 해제되어 86X가 떨어진 경우, 남은 표시기억 자체를 별도 86X 잠금으로 사용하지 않는다.
- 보호 OR에서 `_F` 접점을 직접 사용하는 항목은 원인 입력을 해제한 뒤 표시기억까지 복귀해야 허가가 회복된다. 적용 항목: R1/R2/R3의 63G2, D1/D2의 87T/63G2, H1/H2/H3의 SGR, 52-1/52-2의 63G2.
- R1·R2·R3·52-1은 원인이 동작 중이면 일괄 표시기억 복귀를 허용하지 않는다. 새 8개 반은 원본 FRESET 펄스를 실행하며 원인이 남아 있으면 표시기억이 다시 설정된다. 전역 초기화는 모든 설비를 초기 상태로 돌리고 모의 입력·표시기억·대기 타이머도 지운다.
- R2_84X·R3_84X는 각 89 단로기 1차측 전압으로 자동 결정한다. 온수 측은 좌측 변전소에서 상시 공급받으므로 89-R2가 개방돼도 R2_84X는 동작한다. 상동 측 외부 전원은 초기 무가압이고, 89-R3 1차측이 역가압되는 경우도 계산한다. R1의 84X 정상 접점과 도면 밖 NEG a접점은 기본 동작인 별도의 연습용 입력이다.

## 실제 소스로 해소한 부분

DB1/DB2의 HT 병렬 분기, D1/D2의 26TP 보호 경로, H1/H2/H3의 UVR1 a접점 및 H1 TOF, 반대쪽 2호계 보호는 압축파일의 소스로 반영했다. 위 초기 PDF 검토 표의 해석을 현재 동작으로 사용하지 않는다. 상세한 현재 동작과 남아 있는 범위는 [압축파일 소스 적용 기록](station-logic-review.md)을 기준으로 한다. 기존 R1/R2/R3/52-1의 적용 범위는 각각의 소스 문서를 따른다.

## 검증

```sh
node tests/ac-protection.test.js
node tests/r1-sequence.test.js
node tests/r2-sequence.test.js
node tests/r3-sequence.test.js
node tests/primary-voltage.test.js
node tests/s1-sequence.test.js
node tests/station-sequence.test.js
```

정방향/역방향 인터록, 보호 트립의 수동 제한 우회, D1→DB1 전파, 역방향 경보, H1 DS 조건, 소스 기준 R1 트립·경보 구분 및 R2/R3 84X 진리표, 0.5초/1초 타이머와 취소, 원인 해제/표시기억 복귀 및 초기화 후 지연 동작 방지를 검증한다. UI는 상대 경로로 JS/CSS를 읽으며 GitHub Pages와 다운로드한 정적 파일 모두 사용 가능하다.
