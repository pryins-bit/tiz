# Channel Decision Log

이 문서는 `korea.m3u` 채널 편성/제외 결정을 기술적 스트림 상태와 분리해서 기록한다.

- `REMOVED_AUDIENCE_FIT`: 스트림 자체는 동작하지만 이 TV의 주 사용자인 어머니에게 적합하지 않아 편성에서 제외.
- `REJECTED_DEVICE_TEST`: 후보 스트림을 실제 대상 TV에서 시험했으나 재생되지 않아 편성하지 않음.
- `SPECIAL_PROVIDER`: 일반 M3U 고정 URL이 아니라 채널별 공식 provider를 통해 재생 시점에 소스를 결정.
- 대상 기기: Samsung KU50UA7050FXKR / Tizen 6.0 / TizenBrew 2.0.5

## 2026-08-19 — staged channel-only model

### Authoritative cleanup scope

채널 정리의 기준선은 현재 `main`의 **broad approved playlist**다. 전체 편성을 임의의 소수 채널로 축소하지 않는다. 사용자가 검토 중 명시적으로 삭제를 확정한 범위는 당시 56~62번으로 지칭한 아래 해외 7개뿐이다.

`app/channel-policy.js`가 broad playlist를 불러온 직후 이 7개 record만 제거하고, 그 뒤 `app/kbs-provider.js`가 KBS1/KBS2 특수 채널을 주입한다. 다른 채널은 새 사용자 결정 없이는 제거하지 않는다.

### REMOVED_AUDIENCE_FIT — 확정 해외 7개

| Channel | tvg-id/key | Decision | Reason |
|---|---|---|---|
| Bloomberg TV+ | `bloombergtv` | REMOVED_AUDIENCE_FIT | 해외 영어 경제·금융 뉴스. 어머니용 한국 TV 편성에 부적합. |
| France 24 | `france24_en` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 어머니용 한국 TV 편성에 부적합. |
| euronews english | `euronews_en` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 어머니용 한국 TV 편성에 부적합. |
| FIFA+ | `fifaplus_en` | REMOVED_AUDIENCE_FIT | 해외/영어 중심 축구 FAST 채널. 어머니용 편성에 부적합. |
| TRT World | `trtworld` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 어머니용 한국 TV 편성에 부적합. |
| Newsmax | `newsmax` | REMOVED_AUDIENCE_FIT | 미국 영어 뉴스 채널. 어머니용 한국 TV 편성에 부적합. |
| NTD | `ntd` | REMOVED_AUDIENCE_FIT | 해외 영어/중국 관련 국제방송. 어머니용 한국 TV 편성에 부적합. |

삭제 사유는 **재생 실패가 아니라 audience fit**이다. 따라서 이 7개를 dead stream처럼 기록하거나 다른 정상 채널까지 함께 삭제하면 안 된다.

### SPECIAL_PROVIDER — KBS1 / KBS2

KBS1과 KBS2는 **고정 M3U8 주소로 편성하지 않는다**. `korea.m3u`에는 KBS1/KBS2 고정 스트림을 넣지 않고, `app/kbs-provider.js`가 앱 시작 시 특수 채널 두 개를 채널 목록 앞에 주입한다.

| Channel | Official channel code | Decision | Playback rule |
|---|---:|---|---|
| KBS1 | `11` | SPECIAL_PROVIDER | `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/11`을 재생 시 호출하고 `channel_item[0].service_url`을 AVPlay에 전달. 실패 시 공식 KBS ON AIR 웹 플레이어 fallback. |
| KBS2 | `12` | SPECIAL_PROVIDER | `https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/12`을 재생 시 호출하고 `channel_item[0].service_url`을 AVPlay에 전달. 실패 시 공식 KBS ON AIR 웹 플레이어 fallback. |

`service_url`은 일시적 runtime data이므로 repository playlist에 저장하지 않는다. 고정 relay/proxy, 특히 2026-08-19에 잠시 staging했던 `vthanhtivi`/`30_11` 방식은 요구를 잘못 해석한 것으로 **철회/제거**했다.

### REJECTED_DEVICE_TEST — fixed KBS candidates

아래 고정 KBS 후보는 2026-08-19 실제 대상 TV에서 사용자가 시험했으며 모두 재생되지 않았다. 이 실패는 위 `SPECIAL_PROVIDER` 구조를 사용하는 근거다.

| Channel | Candidate URL | Decision | Reason |
|---|---|---|---|
| KBS1 | `https://1tv.gscdn.kbs.co.kr/1tv_3.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. 고정 URL로 재도입하지 않음. |
| KBS2 | `https://2tv.gscdn.kbs.co.kr/2tv_1.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. 고정 URL로 재도입하지 않음. |
| KBS 24 | `https://news24.gscdn.kbs.co.kr/news24-02/news24-02_hd.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |

### 기록 원칙

- broad baseline을 보존하고, 명시된 7개 외 채널을 추정으로 삭제하지 않는다.
- `REMOVED_AUDIENCE_FIT`를 기술 장애와 혼동하지 않는다.
- KBS1/KBS2의 authoritative architecture는 `SPECIAL_PROVIDER`이며 고정 M3U8 후보를 임의로 다시 추가하지 않는다.
- 공식 KBS API가 반환하는 `service_url`은 저장하지 않는다.
- 이 브랜치는 GitHub staging only다. 실기기 재검증이나 배포 완료를 의미하지 않는다.
