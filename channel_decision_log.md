# Channel Decision Log

이 문서는 `korea.m3u` 채널 편성/제외 결정을 기술적 스트림 상태와 분리해서 기록한다.

- `REMOVED_AUDIENCE_FIT`: 스트림 자체는 동작하지만 이 TV의 주 사용자인 어머니에게 적합하지 않아 편성에서 제외.
- `REJECTED_DEVICE_TEST`: 후보 스트림을 실제 대상 TV에서 시험했으나 재생되지 않아 편성하지 않음.
- `SPECIAL_PROVIDER`: 일반 M3U 고정 URL이 아니라 채널별 공식 provider를 통해 재생 시점에 소스를 결정.
- 대상 기기: Samsung KU50UA7050FXKR / Tizen 6.0 / TizenBrew 2.0.5

## 2026-08-19 — staged channel-only model

### SPECIAL_PROVIDER — KBS1 / KBS2

KBS1과 KBS2는 **고정 M3U8 주소로 편성하지 않는다**. `korea.m3u`와 `approved_channels.json`에는 KBS1/KBS2 고정 스트림을 넣지 않고, `app/kbs-provider.js`가 앱 시작 시 KBS 공식 ON AIR 특수 채널 두 개를 채널 목록 앞에 주입한다.

| Channel | Official ON AIR route | Decision | Playback rule |
|---|---|---|---|
| KBS1 | `onair.kbs.co.kr` / `ch_code=11` | SPECIAL_PROVIDER | 재생 시 공식 ON AIR 응답에서 현재 HLS URL을 동적으로 해석. 해석/AVPlay 실패 시 공식 ON AIR 웹 플레이어를 fallback으로 표시. |
| KBS2 | `onair.kbs.co.kr` / `ch_code=12` | SPECIAL_PROVIDER | 재생 시 공식 ON AIR 응답에서 현재 HLS URL을 동적으로 해석. 해석/AVPlay 실패 시 공식 ON AIR 웹 플레이어를 fallback으로 표시. |

고정 relay/proxy, 특히 `vthanhtivi` 같은 제3자 KBS relay를 사용하지 않는다. 2026-08-19에 잠시 staging했던 `30_11` 고정 relay 방식은 사용자 요구를 잘못 해석한 것으로 **철회/제거**했다.

### Curated model scope

`feature/channel-cleanup-kbs-daegu-20260819`은 기존 광범위 자동 승인 목록을 그대로 배포하지 않고, 한국 공중파/주요 종편/중국드라마/홈쇼핑 중심의 compact snapshot을 유지한다. KBS1/KBS2는 이 M3U snapshot 바깥의 SPECIAL_PROVIDER 채널이다. 이 결정은 현재 `main`을 변경하지 않으며 TV 자동 업데이트 경로에도 영향을 주지 않는다.

### REMOVED_AUDIENCE_FIT — 해외 채널

아래 채널은 검토 시점에 동작 가능하더라도 기술적 장애 때문이 아니라 **어머니용 한국 TV 편성에 맞지 않는다는 이유로 삭제 결정**했다. 향후 자동 수집에서 다시 발견되어도 이 기록을 삭제 근거로 참고한다.

| Channel | tvg-id/key | Decision | Reason |
|---|---|---|---|
| Bloomberg TV+ | `bloombergtv` | REMOVED_AUDIENCE_FIT | 해외 영어 경제·금융 뉴스. 어머니용 한국 TV 편성에 부적합. |
| France 24 | `france24_en` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 어머니용 한국 TV 편성에 부적합. |
| euronews english | `euronews_en` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 어머니용 한국 TV 편성에 부적합. |
| FIFA+ | `fifaplus_en` | REMOVED_AUDIENCE_FIT | 해외/영어 중심 축구 FAST 채널. 어머니용 편성에 부적합. |
| TRT World | `trtworld` | REMOVED_AUDIENCE_FIT | 해외 영어 국제뉴스. 어머니용 한국 TV 편성에 부적합. |
| Newsmax | `newsmax` | REMOVED_AUDIENCE_FIT | 미국 영어 뉴스 채널. 어머니용 한국 TV 편성에 부적합. |
| NTD | `ntd` | REMOVED_AUDIENCE_FIT | 해외 영어/중국 관련 국제방송. 어머니용 한국 TV 편성에 부적합. |

### REJECTED_DEVICE_TEST — fixed KBS candidates

아래 고정 KBS 후보는 2026-08-19 실제 대상 TV에서 사용자가 시험했으며 **모두 재생되지 않았다**. 이 실패가 KBS 채널 자체를 포기한다는 뜻은 아니며, 오히려 고정 M3U8 대신 위 SPECIAL_PROVIDER 구조를 사용하는 근거다.

| Channel | Candidate URL | Decision | Reason |
|---|---|---|---|
| KBS1 | `https://1tv.gscdn.kbs.co.kr/1tv_3.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. 고정 URL로 재도입하지 않음. |
| KBS2 | `https://2tv.gscdn.kbs.co.kr/2tv_1.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. 고정 URL로 재도입하지 않음. |
| KBS 24 | `https://news24.gscdn.kbs.co.kr/news24-02/news24-02_hd.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |

### 기록 원칙

- `REMOVED_AUDIENCE_FIT` 채널은 **작동 불량으로 삭제했다고 기록하지 않는다**. 삭제 근거는 사용자/가정 시청 적합성이다.
- KBS1/KBS2의 authoritative architecture는 `SPECIAL_PROVIDER`이며 고정 M3U8 후보를 임의로 다시 추가하지 않는다.
- 공식 provider가 내부적으로 반환하는 일시적 HLS 주소는 runtime ephemeral data이며 `korea.m3u`에 저장하지 않는다.
- 이 브랜치는 GitHub staging only다. 실기기 재검증이나 배포 완료를 의미하지 않는다.
- 채널을 다시 편성할 경우 기존 기록을 지우지 않고 새 날짜에 `RESTORED` 결정을 추가한다.
