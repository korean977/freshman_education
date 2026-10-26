# 52-1 프로젝트 소스 적용

사용자가 제공한 `52s1.src`는 도면 기기명 **52-1**에 연결한다. RUN/TEST·LOCAL/REMOTE 조작, G86X 보호와 54-1 HSCB 연동을 소스로 적용했다. 원본 프로젝트·도면은 저장소와 배포 산출물에 넣지 않는다.

## 파일 대조

- SRC 헤더는 `LGIS PADT V0.11a SRC / G2K_FI SOURCE`다. PKWARE DCL 압축을 공식 zlib contrib/blast로 해제했다.
- 심볼 블록 27,808바이트(176 × 158개), 로직 블록 124,320바이트(740 × 168행).
- YMS 내부 변수·함수 71개가 SRC 심볼 주소와 일치하고, PCI/YMS의 변환 구간 59개도 일치한다. BAK의 로직 블록은 SRC와 동일하다.
- LOG는 과거 연결 기록이며 현장 장치의 현재 버전을 보증하지 않는다.
- 아래 행은 해제한 로직 데이터의 0부터 시작하는 행이다. 적용한 관계는 `tests/fixtures/52s1-sequence.json`에 기록했다.

## 직접 조작

```text
CX_PERMIT = DI31_NEG_DS_A AND DI36_HSCB_B AND NOT G86X
G52CX = (RUN AND CX_PERMIT AND 투입 명령) OR (TEST AND 투입 명령)
G52TX = (RUN AND DI36_HSCB_B AND 개방 명령) OR (TEST AND 개방 명령)
        OR G86X OR TRIP_TEST1
CB1_52S1_CLOSE = G52CX
CB1_52S1_OPEN = G52TX
```

| 경로 | 소스 행 | 교육 모델 |
| --- | --- | --- |
| 투입 허가 | 28 | NEG 투입 접점 + 54-1 개방 접점 + G86X 비동작 |
| RUN/TEST 투입 | 29~32 | RUN은 허가 필요, TEST는 해당 초기 허가 분기를 우회 |
| RUN/TEST 개방 | 33~38 | RUN 수동 개방은 54-1 개방 필요, TEST 수동·보호·시험 개방은 이 조건을 우회 |
| 차단기 출력 | 25~26 | CB1_52S1_CLOSE / CB1_52S1_OPEN |
| LOCAL/REMOTE | 29~36 | 선택된 조작 위치의 명령 경로만 수용 |

DI36_HSCB_B가 투입·수동 개방 조건에 사용됨을 소스에서 확인했으므로 DI35 A/B 표기 문제로 경로를 보류하지 않는다. DI35_HSCB_A는 해당 제어 경로에 사용되지 않는다. NEG 단로기는 화면 밖 접점으로 모의한다.

이 소스에는 R1/R2/R3의 DS→CB 순차 타이머나 CX/TX 자기유지·명령 제한이 없다. 따라서 `s1-sequence.js`는 52-1용 직접 조작 엔진이다. TEST는 주회로 가압 계산에서 분리하며, 보호·시험 개방을 우선한다. 명령 응답 실패는 수동 조작의 물리 응답을 모의하며 실제 보호 트립 실패를 재현하지 않는다.

## 보호 입력

행 43~52:

```text
G86X = OCR50 OR OCR51 OR OCGR50 OR OCGR51 OR UVR1
       OR G63CB_TP2_F OR DI22_SRTR_26TP OR DI24_REC_26TP
       OR DI38_REC_FAULT OR TP_HSCB_86X
```

- 위 10개 분기를 각각 트립·RUN 재투입 억제로 적용한다. 출력 이름은 **CB1_52S1_OPEN**이다.
- 63G2는 `_F` 접점이므로 원인 해제 후 표시기억 복귀까지 필요하다. 온도·정류기 고장 입력은 보호 OR에서 원 접점을 사용하므로 표시기억만 남은 경우 별도 잠금으로 만들지 않는다.
- OVR, 63G1, 온도 경보, 정류기 온도·다이오드 경보, 29AL은 G86X OR에 없다. OVR은 내부 계전요소 동작을 표시하며 트립에 추가하지 않는다.
- 소스의 DO31_29X는 G29AL_F에서 나온다(행 139). 출력명에 29X가 있다는 이유로 화재 트립 입력을 만들지 않았다.
- TRIP_TEST1은 G86X와 별도로 G52TX에 들어간다. 시험 개방이 G86X 보호를 동작시켰다고 표시하지 않는다.
- G86X_F 자기유지 입력은 G86X1로 기재돼 있으나 G86X1을 구동하는 코일이 이 로직에 없다. G86X 보호 OR와 차단기 출력은 별도 경로로 확인된다. 화면의 보호 동작 이력·표시기억을 해당 PLC 비트의 완전한 재현이라고 보지는 않는다.

## HSCB 고장: TP 1초

행 87~89의 블록은 **TP**, 인스턴스 `TP_HSCB`, 설정 `T#1S`다. `TON_HSCB`, `TOF_HACB` 등 사용되지 않는 심볼에서 추가 동작을 추정하지 않는다.

1. HSCB_FAULT 입력 상승 시 TP_HSCB_86X가 **즉시 ON** 되어 G86X로 트립한다.
2. 입력을 빨리 해제해도 펄스는 시작 후 1초 동안 유지한다.
3. 유지 중의 새 상승 에지는 펄스를 연장·재시작하지 않는다.
4. 1초 뒤 펄스는 OFF가 된다. 입력을 계속 유지해도 자동 반복하지 않으며 다음 유효 상승 에지가 있어야 다시 시작한다.
5. TP_HSCB_86X_F는 표시기억이며 보호 OR에 직접 들어가지 않는다. 펄스 종료 후 남은 표시기억을 별도 보호 잠금으로 쓰지 않는다.

## 54-1 AC 연동

행 39~41:

```text
HSCB_CX_PERMIT = DI01_52S1_A AND NOT UVR1 → DO14_HSCB_PERMIT
HSCB_TRIP = NOT DI01_52S1_A OR UVR1       → DO15_HSCB_TRIP
```

52-1 투입 상태와 UVR1 비동작이 54-1 투입 허가다. 52-1 개방 또는 UVR1 동작 시 54-1이 개방된다. 54-1 자동 재투입은 추가하지 않는다. 이 출력식에는 RUN 접점이 없으므로 TEST의 CB 투입 접점으로도 허가 출력은 관찰할 수 있다. 다만 TEST 차단기는 주회로 가압 모델에서 분리되어 선로를 가압하지 않는다. 전체 DC 보호·54-1 제어 로직을 구현한 것은 아니다.

## 검증

원본 접점 종류·배선 연결 그래프로 투입 허가 8조합, RUN/TEST·LOCAL/REMOTE 투입 128조합, 개방·보호·시험 경로 512조합, HSCB 출력 4조합씩을 대조했다. 커밋된 테스트는 10개 보호 분기, TEST 보호 우선, LOCAL/REMOTE, HSCB 1초 펄스 경계·짧은 입력·재트리거 제한, 표시기억 복귀, 실패·초기화, 기존 R2와의 독립 동작을 검증한다.

```sh
node tests/s1-sequence.test.js
node tests/ac-protection.test.js
python3 scripts/build_site.py
```
