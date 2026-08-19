# Channel Decision Log

이 문서는 `korea.m3u` 채널 편성/제외 결정을 기술적 스트림 상태와 분리해서 기록한다.

- `REMOVED_AUDIENCE_FIT`: 스트림 자체는 동작하지만 이 TV의 주 사용자인 어머니에게 적합하지 않아 편성에서 제외.
- `REJECTED_DEVICE_TEST`: 후보 스트림을 실제 대상 TV에서 시험했으나 재생되지 않아 편성하지 않음.
- 대상 기기: Samsung KU50UA7050FXKR / Tizen 6.0 / TizenBrew 2.0.5

## 2026-08-19

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

### REJECTED_DEVICE_TEST — KBS 후보 3개

아래 KBS 후보는 2026-08-19 실제 대상 TV에서 사용자가 시험했으며 **모두 재생되지 않았다**. 따라서 현재 `korea.m3u`에 추가하지 않는다. 이 결과는 URL 자체가 영구 사망했다는 뜻이 아니라, 현재 대상 Samsung Tizen 6 환경에서 채택 불가라는 뜻이다.

| Channel | Candidate URL | Decision | Reason |
|---|---|---|---|
| KBS1 | `https://1tv.gscdn.kbs.co.kr/1tv_3.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |
| KBS2 | `https://2tv.gscdn.kbs.co.kr/2tv_1.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |
| KBS 24 | `https://news24.gscdn.kbs.co.kr/news24-02/news24-02_hd.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |

### 기록 원칙

- `REMOVED_AUDIENCE_FIT` 채널은 **작동 불량으로 삭제했다고 기록하지 않는다**. 삭제 근거는 사용자/가정 시청 적합성이다.
- `REJECTED_DEVICE_TEST` 후보는 나중에 다른 공식/공개 HLS URL이 발견되면 새 URL을 별도 항목으로 재시험할 수 있다.
- 채널을 다시 편성할 경우 기존 기록을 지우지 않고 새 날짜에 `RESTORED` 결정을 추가한다.
