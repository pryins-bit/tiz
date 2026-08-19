# Channel Decision Log

이 문서는 `korea.m3u` 채널 편성/제외 결정을 기술적 스트림 상태와 분리해서 기록한다.

- `REMOVED_AUDIENCE_FIT`: 스트림 자체는 동작하지만 이 TV의 주 사용자인 어머니에게 적합하지 않아 편성에서 제외.
- `REMOVED_CURATION_RELIABILITY`: 중복 역할 채널 중 더 불안정한 전송 특성을 가진 후보를 편성 단순화를 위해 제외.
- `REJECTED_DEVICE_TEST`: 후보 스트림을 실제 대상 TV에서 시험했으나 재생되지 않아 편성하지 않음.
- `SPECIAL_PROVIDER`: 고정 M3U URL 대신 공식 API에서 재생 시점에 실제 URL을 얻는 특수 채널.
- 대상 기기: Samsung KU50UA7050FXKR / Tizen 6.0 / TizenBrew 2.0.5

## 2026-08-19 — Update 1

### 최종 편성 계약

Update 1은 TV 화면에 **총 56채널**을 노출한다.

- 일반 M3U 계열: 검토된 allowlist 54개
- KBS 공식 동적 채널: KBS1 + KBS2 2개
- RF/TVWindow 튜너 기능: Update 1에 포함하지 않음

원본 broad 스트림 registry와 `korea.m3u` 데이터는 후보/감사 이력을 보존하기 위해 삭제하지 않는다. 대신 설치된 shell의 `app/channel-policy.js`가 TV에서 실제로 보일 수 있는 일반 채널을 54개 allowlist로 제한한다. 따라서 자동 스트림 수집이 broad 데이터를 갱신해도 미승인 해외 FAST 채널은 다시 TV 편성에 나타나지 않는다.

### REMOVED_AUDIENCE_FIT — 검토 56~62번 해외 채널

아래 채널은 기술적 장애 때문이 아니라 **어머니용 한국 TV 편성에 맞지 않는다는 이유로 삭제 확정**했다.

| Channel | tvg-id/key | Decision | Reason |
|---|---|---|---|
| Bloomberg TV+ | `bloombergtv` | REMOVED_AUDIENCE_FIT | 해외 영어 경제·금융 뉴스. 어머니용 한국 TV 편성에 부적합. |
| France 24 | `france24_en` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 어머니용 한국 TV 편성에 부적합. |
| euronews english | `euronews_en` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 역할 중복 및 한국 가정용 편성 우선. |
| FIFA+ | `fifaplus_en` | REMOVED_AUDIENCE_FIT | 해외 영어 스포츠 FAST 채널. 최종 검토에서 삭제 확정. |
| TRT World | `trtworld` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 한국 일반 TV 용도에 부적합. |
| Newsmax | `newsmax` | REMOVED_AUDIENCE_FIT | 미국 정치·시사 중심 영어 뉴스. 어머니용 편성에 부적합. |
| NTD | `ntd` | REMOVED_AUDIENCE_FIT | 중국/국제뉴스 중심 해외 방송. 특별 시청 목적이 없어 삭제. |

### REMOVED_CURATION_RELIABILITY — MBC 1080p 3개 → 2개

사용자는 춘천MBC·MBC 강원영동·여수MBC의 1080p 지역국 3개 중 하나를 더 줄여 2개만 남기기로 했다. 당시 실TV에서 어느 하나가 최종적으로 가장 약했는지 이름까지 기록되지는 않았다. Update 1에서는 세 후보 중 **MBC 강원영동 (`HLAQDTV.kr@SD`)**을 제외한다.

선택 근거는 해당 후보가 `http://123.254.93.7/...` 형태의 **raw-IP HTTP** 전송인 반면 춘천/여수 후보는 HTTPS 호스트형 스트림이어서, 실측 최종 승자가 기록되지 않은 조건에서 전송 안정성/유지보수성 기준으로 강원영동을 가장 보수적으로 제외하는 것이 합리적이기 때문이다. 이 결정은 "실TV에서 강원영동이 반드시 가장 약했다"는 기록으로 취급하지 않는다.

### REJECTED_DEVICE_TEST — 기존 고정 KBS 후보 3개

아래 고정 KBS 후보는 실제 대상 TV에서 시험했으며 모두 재생되지 않았다. 따라서 고정 M3U8으로 재도입하지 않는다.

| Channel | Candidate URL | Decision | Reason |
|---|---|---|---|
| KBS1 | `https://1tv.gscdn.kbs.co.kr/1tv_3.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |
| KBS2 | `https://2tv.gscdn.kbs.co.kr/2tv_1.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |
| KBS 24 | `https://news24.gscdn.kbs.co.kr/news24-02/news24-02_hd.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. Update 1에는 포함하지 않음. |

### SPECIAL_PROVIDER — KBS1 / KBS2

KBS1/KBS2는 고정 M3U8 대신 KBS 공식 live API를 사용한다.

| Channel | channel_code | Official API | Playback |
|---|---:|---|---|
| KBS1 | `11` | `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/11` | `channel_item[0].service_url`을 그때 받아 AVPlay로 재생 |
| KBS2 | `12` | `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/12` | `channel_item[0].service_url`을 그때 받아 AVPlay로 재생 |

API 또는 AVPlay 실패 시 KBS 공식 ON AIR 페이지를 fallback으로 사용한다. `service_url`은 일시적인 runtime 데이터이며 repository playlist에 저장하지 않는다. 제3자 KBS relay/proxy는 사용하지 않는다.

### 기록 원칙

- `REMOVED_AUDIENCE_FIT`를 스트림 장애와 혼동하지 않는다.
- `REMOVED_CURATION_RELIABILITY`는 중복 역할을 줄이기 위한 편성 결정이며 원본 registry 삭제를 의미하지 않는다.
- KBS1/KBS2의 authoritative architecture는 `SPECIAL_PROVIDER`; 고정 M3U8을 임의로 다시 추가하지 않는다.
- Update 1의 visible contract는 **54 일반 + 2 KBS = 56**이다.
- RF tuner 실험은 별도 Update 2에서만 다룬다.
- 채널을 다시 편성할 경우 기존 기록을 지우지 않고 새 날짜에 `RESTORED` 결정을 추가한다.
