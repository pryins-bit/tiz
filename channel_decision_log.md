# Channel Decision Log

이 문서는 `korea.m3u` 채널 편성/제외 결정을 기술적 스트림 상태와 분리해서 기록한다.

- `REMOVED_AUDIENCE_FIT`: 스트림 자체는 동작하지만 이 TV의 주 사용자인 어머니에게 적합하지 않아 편성에서 제외.
- `REJECTED_DEVICE_TEST`: 후보 스트림을 실제 대상 TV에서 시험했으나 재생되지 않아 편성하지 않음.
- `STAGED_DEVICE_RECHECK`: 사용자가 동일 채널의 동작을 확인했지만, 이 브랜치에 고정한 정확한 URL은 배포 전 대상 TV에서 다시 확인해야 함.
- 대상 기기: Samsung KU50UA7050FXKR / Tizen 6.0 / TizenBrew 2.0.5

## 2026-08-19 — staged channel-only model

### STAGED_DEVICE_RECHECK — KBS1 대구

사용자는 KBS 대구 채널을 추가한 뒤 대상 TV에서 재생된다고 보고했다. 배포를 하지 않는 현재 작업에서는 채널 코드 `30_11`에 대응하는 공개 HLS relay 후보를 `korea.m3u` 첫 채널로 고정한다. 이 브랜치는 **GitHub staging only**이며 `main`에 merge하거나 Release/WGT를 만들지 않는다.

| Channel | Candidate URL | Decision | Reason |
|---|---|---|---|
| KBS1 대구 | `https://code.vthanhtivi.pw/getlink/kbs/30_11/playlist.m3u8` | STAGED_DEVICE_RECHECK | KBS 대구가 대상 TV에서 동작한다는 사용자 보고와 동일한 `30_11` 지역 채널 코드. 정확한 URL은 귀가 후 실기기 재검증 후 승격. |

### Curated model scope

`feature/channel-cleanup-kbs-daegu-20260819`은 기존 광범위 자동 승인 목록을 그대로 배포하지 않고, 한국 공중파/주요 종편/중국드라마/홈쇼핑 중심의 24개 채널 snapshot만 유지한다. 이 결정은 현재 `main`을 변경하지 않으며 TV 자동 업데이트 경로에도 영향을 주지 않는다.

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

아래 KBS 후보는 2026-08-19 실제 대상 TV에서 사용자가 시험했으며 **모두 재생되지 않았다**. 따라서 이 세 URL은 채택하지 않는다. 새 KBS 대구 후보는 위의 별도 항목으로 관리한다.

| Channel | Candidate URL | Decision | Reason |
|---|---|---|---|
| KBS1 | `https://1tv.gscdn.kbs.co.kr/1tv_3.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |
| KBS2 | `https://2tv.gscdn.kbs.co.kr/2tv_1.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |
| KBS 24 | `https://news24.gscdn.kbs.co.kr/news24-02/news24-02_hd.m3u8` | REJECTED_DEVICE_TEST | 실제 대상 TV에서 재생 실패. |

### 기록 원칙

- `REMOVED_AUDIENCE_FIT` 채널은 **작동 불량으로 삭제했다고 기록하지 않는다**. 삭제 근거는 사용자/가정 시청 적합성이다.
- `REJECTED_DEVICE_TEST` 후보는 나중에 다른 공식/공개 HLS URL이 발견되면 새 URL을 별도 항목으로 재시험할 수 있다.
- `STAGED_DEVICE_RECHECK`는 GitHub에 코드를 준비한 상태일 뿐 실기기 재검증이나 배포 완료를 의미하지 않는다.
- 채널을 다시 편성할 경우 기존 기록을 지우지 않고 새 날짜에 `RESTORED` 결정을 추가한다.
