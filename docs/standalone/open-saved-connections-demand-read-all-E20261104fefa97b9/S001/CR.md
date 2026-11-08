<!-- insrc:artifact CR-fefa97b991537da7-s1 -->

# Code review: s1

Status: **changes_requested** · task-based schema version 2

## cr-fefa97b991537da7-s1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-08T18:38:21.556Z

6 selected task assessment(s): changes_requested.

### Submitted scope

- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/__tests__/fixtures/fake-keytar.ts` — [{"after":[1,28]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/__tests__/on-demand-open.test.ts` — [{"after":[1,14]},{"after":[16,16]},{"after":[18,20]},{"after":[22,22]},{"after":[24,26]},{"after":[29,34]},{"after":[36,59]},{"after":[65,73]},{"after":[76,83]},{"after":[85,87]},{"after":[90,90]},{"after":[96,97]},{"after":[99,99]},{"after":[108,108]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/connection-management-rpc.ts` — [{"after":[9,9]},{"after":[46,57]},{"after":[59,59]},{"after":[66,67]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/db-rpc.ts` — [{"after":[31,32]},{"after":[80,82]},{"after":[139,142]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/db/__tests__/fixtures/session-source-inventory.json` — [{"after":[21,21]},{"after":[31,31]},{"after":[41,41]},{"after":[8531,8537]},{"after":[8751,8758]},{"after":[10856,10862]},{"after":[10929,10932]},{"after":[10941,10944]},{"after":[10998,11008]},{"after":[11576,11583]},{"after":[12638,12642]},{"deletionAt":14275},{"deletionAt":14375},{"after":[14417,14427]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/db/managed-store.ts` — [{"after":[10,11]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/db/management-defaults.ts` — [{"after":[17,18]},{"after":[27,31]},{"after":[45,45]},{"deletionAt":47},{"after":[54,54]},{"after":[59,63]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/db/management.ts` — [{"after":[14,14]},{"after":[63,67]},{"after":[71,71]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/db/secrets.ts` — [{"after":[32,39]},{"after":[42,44]},{"after":[220,221]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/daemon/index.ts` — [{"after":[50,50]},{"deletionAt":468}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/mcp/__tests__/helpers/mcp-e2e.ts` — [{"after":[68,71]}]
- `57251e884d1bc1e02e16d93fa25757513715745f:src/shared/keystore.ts` — [{"after":[13,19]}]
- `11074076807e36eeecca86306b30e386c0ad7399:src/daemon/__tests__/fixtures/fake-keytar.ts` — [{"after":[5,8]},{"after":[10,11]},{"after":[13,13]},{"after":[36,44]}]
- `11074076807e36eeecca86306b30e386c0ad7399:src/daemon/__tests__/on-demand-open.test.ts` — [{"after":[17,17]},{"after":[23,23]},{"after":[25,25]},{"after":[29,29]},{"after":[34,36]},{"after":[40,40]},{"after":[43,43]},{"after":[47,47]},{"after":[67,67]},{"after":[70,70]},{"after":[91,91]},{"deletionAt":104},{"after":[106,114]}]
- `3260a994039f601c44a5ceda2407c497c2bcf24d:src/daemon/__tests__/on-demand-open.test.ts` — [{"deletionAt":20},{"deletionAt":22},{"deletionAt":92},{"after":[94,105]}]
- `3260a994039f601c44a5ceda2407c497c2bcf24d:src/daemon/connection-management-rpc.ts` — [{"after":[132,133]}]
- `3260a994039f601c44a5ceda2407c497c2bcf24d:src/daemon/db/__tests__/fixtures/session-source-inventory.json` — [{"after":[11,11]},{"after":[8530,8530]}]
- `15ab2f42cb14866788c269c4372e3a5171be319e:src/daemon/__tests__/fixtures/fake-keytar.ts` — [{"after":[25,27]}]
- `15ab2f42cb14866788c269c4372e3a5171be319e:src/daemon/__tests__/on-demand-open.test.ts` — [{"after":[15,15]},{"after":[28,28]},{"after":[66,68]},{"after":[70,72]},{"after":[80,80]},{"after":[82,82]},{"after":[84,88]}]
- `15ab2f42cb14866788c269c4372e3a5171be319e:src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — [{"after":[1076,1100]}]
- `15ab2f42cb14866788c269c4372e3a5171be319e:src/shared/__tests__/keystore-vault.test.ts` — [{"after":[1,36]},{"after":[38,202]}]
- `15ab2f42cb14866788c269c4372e3a5171be319e:src/shared/keystore.ts` — [{"after":[2,2]},{"after":[4,9]},{"after":[14,22]},{"after":[24,24]},{"after":[32,33]},{"after":[36,119]},{"after":[121,123]},{"after":[125,138]},{"after":[140,141]},{"after":[144,144]},{"after":[150,150]},{"after":[152,155]},{"after":[160,169]},{"after":[174,174]}]
- `c58d36110d6277dadb39f0bfb24f3e7e8dffa34c:src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — [{"after":[1081,1085]}]
- `c58d36110d6277dadb39f0bfb24f3e7e8dffa34c:src/shared/__tests__/keystore-vault.test.ts` — [{"after":[23,23]},{"after":[25,25]},{"after":[32,33]},{"after":[38,44]},{"after":[48,48]},{"after":[214,333]}]
- `c58d36110d6277dadb39f0bfb24f3e7e8dffa34c:src/shared/keystore.ts` — [{"after":[8,10]},{"after":[55,61]},{"after":[67,68]},{"after":[77,77]},{"after":[133,133]},{"after":[137,137]},{"after":[155,208]},{"after":[212,215]},{"after":[226,226]},{"after":[236,236]}]
- `19d10b5b9648e5c7a852cf61c2c7c4ecd497d3a3:src/daemon/__tests__/fixtures/fake-keytar.ts` — [{"after":[15,15]},{"after":[23,23]}]
- `19d10b5b9648e5c7a852cf61c2c7c4ecd497d3a3:src/daemon/__tests__/keystore-forwarding.test.ts` — [{"after":[1,130]}]
- `19d10b5b9648e5c7a852cf61c2c7c4ecd497d3a3:src/daemon/db/__tests__/fixtures/session-source-inventory.json` — [{"after":[16583,16590]},{"after":[17089,17094]}]
- `19d10b5b9648e5c7a852cf61c2c7c4ecd497d3a3:src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — [{"after":[1081,1084]}]
- `19d10b5b9648e5c7a852cf61c2c7c4ecd497d3a3:src/daemon/threads/main-services.ts` — [{"after":[38,38]},{"after":[106,107]},{"after":[173,173]}]
- `19d10b5b9648e5c7a852cf61c2c7c4ecd497d3a3:src/daemon/threads/worker-entry.ts` — [{"after":[30,31]},{"after":[77,78]}]
- `19d10b5b9648e5c7a852cf61c2c7c4ecd497d3a3:src/shared/keystore.ts` — [{"after":[11,13]},{"after":[40,41]},{"after":[46,52]},{"after":[79,95]},{"after":[179,179]},{"after":[236,236]},{"after":[244,244]},{"after":[246,246]},{"after":[254,254]},{"after":[268,268]},{"after":[272,303]}]
- `668d356095fbfa0af194b562b652c61d5dd1929b:src/bin/insrc-connection-maintenance.ts` — [{"after":[10,10]},{"after":[16,24]}]
- `668d356095fbfa0af194b562b652c61d5dd1929b:src/daemon/__tests__/fixtures/fake-keytar.ts` — [{"after":[11,11]},{"after":[13,13]},{"after":[51,59]}]
- `668d356095fbfa0af194b562b652c61d5dd1929b:src/daemon/__tests__/keystore-guard.test.ts` — [{"after":[1,96]}]
- `668d356095fbfa0af194b562b652c61d5dd1929b:src/daemon/db/__tests__/fixtures/session-source-inventory.json` — [{"after":[6549,6555]}]
- `668d356095fbfa0af194b562b652c61d5dd1929b:src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — [{"after":[1085,1089]}]
- `668d356095fbfa0af194b562b652c61d5dd1929b:src/shared/keystore.ts` — [{"after":[20,20]},{"after":[22,22]},{"after":[83,95]},{"after":[166,168]}]
- `668d356095fbfa0af194b562b652c61d5dd1929b:src/shared/paths.ts` — [{"after":[10,11]}]
- `8137001adbee894c4255c2830145748f62f85b05:src/assets/connection-management-inventory.json` — [{"after":[7810,7810]},{"after":[8007,8007]},{"after":[10262,10262]},{"after":[10855,10855]},{"after":[11800,11800]},{"after":[13059,13059]},{"after":[13343,13343]},{"after":[15571,15571]},{"after":[16043,16043]},{"after":[37994,37996]},{"after":[38036,38036]},{"after":[39776,39776]},{"after":[39834,39834]},{"after":[39843,39843]},{"after":[39850,39850]},{"after":[39856,39856]},{"after":[39859,39860]},{"after":[39942,39942]},{"after":[39954,39954]},{"after":[40209,40209]},{"after":[40214,40214]}]
- `8137001adbee894c4255c2830145748f62f85b05:src/daemon/__tests__/keystore-consumers.test.ts` — [{"after":[1,110]}]
- `8137001adbee894c4255c2830145748f62f85b05:src/daemon/db/__tests__/fixtures/session-source-inventory.json` — [{"after":[14157,14168]},{"after":[35708,35740]}]
- `8137001adbee894c4255c2830145748f62f85b05:src/daemon/handler-runtime.ts` — [{"after":[1485,1485]}]
- `8137001adbee894c4255c2830145748f62f85b05:src/shared/keystore.ts` — [{"after":[14,18]}]
- `640372bb9b53b956699a331071ac493e514f1d22:src/assets/connection-management-inventory.json` — [{"after":[8007,8022]},{"after":[8025,8026]},{"after":[10764,10771]},{"after":[10832,10875]},{"after":[10908,10935]},{"after":[10953,10954]},{"after":[12856,12995]},{"after":[13052,13059]},{"after":[13164,13171]},{"after":[13292,13295]},{"after":[13308,13311]},{"after":[13321,13322]},{"after":[13441,13446]},{"after":[13450,13450]},{"after":[13454,13454]},{"deletionAt":13599},{"after":[13606,13606]},{"after":[15804,15807]},{"after":[15822,15822]},{"after":[15825,15826]},{"after":[15837,15838]},{"after":[38265,38288]}]
- `0918f48df792095e9b22ea370350f195a173361f:src/daemon/db/__tests__/fixtures/driver-field-matrix.json` — [{"after":[2376,2376]},{"after":[2380,2381]}]
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/assets/connection-management-inventory.json` — [{"deletionAt":5562},{"after":[5600,5602]},{"after":[10294,10301]},{"after":[10347,10349]},{"after":[40000,40000]},{"after":[40128,40128]}]
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/bin/insrc-connection-maintenance.ts` — [{"after":[6,6]},{"after":[37,38]}]
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/fixtures/session-source-inventory.json` — [{"deletionAt":6504},{"after":[6542,6544]},{"after":[10879,10886]},{"after":[10932,10941]}]
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/management-adoption.ts` — [{"after":[24,28]}]

### Verified final scope: 7e322e0f5cef163377553c27e68b2c1381e26975

Projection: 1d68e1f43d7d14014f9b6c2c0fa42bcea7f282676da340db28f2fde5094aa4dc · attribution: accepted

- `src/daemon/__tests__/fixtures/fake-keytar.ts` (ea615bd83e9c200c3f892241ea64713b2a67260e) — selected: [{"after":[1,4]},{"after":[9,9]},{"after":[14,14]},{"after":[16,16]},{"after":[18,24]},{"after":[26,28]},{"after":[32,42]}]
- `src/daemon/__tests__/on-demand-open.test.ts` (f26497d7f990058eaaa6c9bec37a0129c5eeb0c5) — selected: [{"after":[1,14]},{"after":[16,16]},{"after":[18,20]},{"after":[21,21]},{"after":[24,26]},{"after":[29,31]},{"after":[35,37]},{"after":[39,40]},{"after":[42,44]},{"after":[46,64]},{"after":[73,79]},{"after":[81,81]},{"after":[83,83]},{"after":[89,96]},{"after":[98,100]},{"after":[101,101]},{"after":[114,115]},{"after":[116,116]},{"after":[126,126]}]
- `src/daemon/connection-management-rpc.ts` (47a9b9d5a9b5b4dcd1ae893f027f20c6777c5ee7) — selected: [{"after":[9,9]},{"after":[46,57]},{"after":[59,59]},{"after":[66,67]}]
- `src/daemon/db-rpc.ts` (6ee8c824c3c8d12e7b1c72fa6104f11dca46470a) — selected: [{"after":[31,32]},{"after":[80,82]},{"after":[139,142]}]
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` (44e19a36ccd05763b6e753ad8ced648f85ad9543) — selected: [{"after":[21,21]},{"after":[31,31]},{"after":[41,41]},{"after":[8538,8544]},{"after":[8758,8765]},{"after":[10863,10869]},{"after":[10951,10954]},{"after":[10963,10966]},{"after":[11020,11030]},{"after":[11598,11605]},{"after":[12660,12664]},{"after":[14450,14460]},{"deletionAt":14308},{"deletionAt":14408}]
- `src/daemon/db/managed-store.ts` (efa68da6c091b262cefea151c9e8cfcd9d1614f3) — selected: [{"after":[10,11]}]
- `src/daemon/db/management-defaults.ts` (bb6a2b62640024d4ded207578da74dc0f67adf37) — selected: [{"after":[17,18]},{"after":[27,31]},{"after":[45,45]},{"after":[54,54]},{"after":[59,63]},{"deletionAt":47}]
- `src/daemon/db/management.ts` (d386df8a6e3bd3870e1bfe687e128812b1a4c7a8) — selected: [{"after":[14,14]},{"after":[63,67]},{"after":[71,71]}]
- `src/daemon/db/secrets.ts` (d3dc23f52b4424ad35fea461b53ac97c288365d0) — selected: [{"after":[32,39]},{"after":[42,44]},{"after":[220,221]}]
- `src/daemon/index.ts` (c3b7215a8d9065d5d872a2b1313a38fa150ce8be) — selected: [{"after":[50,50]},{"deletionAt":468}]
- `src/mcp/__tests__/helpers/mcp-e2e.ts` (925a4c75d4af7a4eb953c0130db1fa6c73a37fbd) — selected: [{"after":[68,71]}]
- `src/shared/keystore.ts` (25a4a836f3373ab48512bd52543f1a9ea943bfe4) — selected: [{"after":[38,44]}]
- `src/daemon/__tests__/fixtures/fake-keytar.ts` (ea615bd83e9c200c3f892241ea64713b2a67260e) — selected: [{"after":[5,8]},{"after":[10,10]},{"after":[12,12]},{"after":[15,15]},{"after":[43,50]},{"after":[60,60]}]
- `src/daemon/__tests__/on-demand-open.test.ts` (f26497d7f990058eaaa6c9bec37a0129c5eeb0c5) — selected: [{"after":[17,17]},{"after":[22,22]},{"after":[23,23]},{"after":[27,27]},{"after":[32,34]},{"after":[38,38]},{"after":[41,41]},{"after":[45,45]},{"after":[65,65]},{"after":[69,69]},{"after":[97,97]},{"after":[117,125]},{"deletionAt":115}]
- `src/daemon/__tests__/on-demand-open.test.ts` (f26497d7f990058eaaa6c9bec37a0129c5eeb0c5) — selected: [{"after":[102,113]},{"deletionAt":20},{"deletionAt":22},{"deletionAt":100}]
- `src/daemon/connection-management-rpc.ts` (47a9b9d5a9b5b4dcd1ae893f027f20c6777c5ee7) — selected: [{"after":[132,133]}]
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` (44e19a36ccd05763b6e753ad8ced648f85ad9543) — selected: [{"after":[11,11]},{"after":[8537,8537]}]
- `src/daemon/__tests__/fixtures/fake-keytar.ts` (ea615bd83e9c200c3f892241ea64713b2a67260e) — selected: [{"after":[29,31]}]
- `src/daemon/__tests__/on-demand-open.test.ts` (f26497d7f990058eaaa6c9bec37a0129c5eeb0c5) — selected: [{"after":[15,15]},{"after":[28,28]},{"after":[66,68]},{"after":[70,72]},{"after":[80,80]},{"after":[82,82]},{"after":[84,88]}]
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` (fc4c6f45f7dc8a4698e9a50645574a7aa63fb93d) — selected: [{"after":[1076,1080]},{"after":[1095,1114]}]
- `src/shared/__tests__/keystore-vault.test.ts` (9296125f42290e88debdf494a2ee30fe8cd8334b) — selected: [{"after":[1,22]},{"after":[24,24]},{"after":[26,31]},{"after":[34,37]},{"after":[45,47]},{"after":[49,213]}]
- `src/shared/keystore.ts` (25a4a836f3373ab48512bd52543f1a9ea943bfe4) — selected: [{"after":[2,2]},{"after":[4,7]},{"after":[19,20]},{"after":[26,26]},{"after":[28,35]},{"after":[37,37]},{"after":[45,46]},{"after":[49,52]},{"after":[60,71]},{"after":[79,83]},{"after":[116,123]},{"after":[125,170]},{"after":[174,182]},{"after":[184,186]},{"after":[188,201]},{"after":[257,258]},{"after":[260,260]},{"after":[268,268]},{"after":[270,273]},{"after":[278,282]},{"after":[284,288]},{"after":[292,292]}]
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` (fc4c6f45f7dc8a4698e9a50645574a7aa63fb93d) — selected: [{"after":[1090,1094]}]
- `src/shared/__tests__/keystore-vault.test.ts` (9296125f42290e88debdf494a2ee30fe8cd8334b) — selected: [{"after":[23,23]},{"after":[25,25]},{"after":[32,33]},{"after":[38,44]},{"after":[48,48]},{"after":[214,333]}]
- `src/shared/keystore.ts` (25a4a836f3373ab48512bd52543f1a9ea943bfe4) — selected: [{"after":[8,10]},{"after":[72,78]},{"after":[84,85]},{"after":[124,124]},{"after":[183,183]},{"after":[187,187]},{"after":[205,258]},{"after":[261,264]},{"after":[274,274]},{"after":[283,283]}]
- `src/daemon/__tests__/fixtures/fake-keytar.ts` (ea615bd83e9c200c3f892241ea64713b2a67260e) — selected: [{"after":[17,17]},{"after":[25,25]}]
- `src/daemon/__tests__/keystore-forwarding.test.ts` (cf2e3e575a6c6ec0f37426c9b5eee907d22db9e4) — selected: [{"after":[1,130]}]
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` (44e19a36ccd05763b6e753ad8ced648f85ad9543) — selected: [{"after":[16616,16623]},{"after":[17122,17127]}]
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` (fc4c6f45f7dc8a4698e9a50645574a7aa63fb93d) — selected: [{"after":[1081,1084]}]
- `src/daemon/threads/main-services.ts` (3b0824971d5f36a67bbf4643286e5aef6389708e) — selected: [{"after":[38,38]},{"after":[106,107]},{"after":[173,173]}]
- `src/daemon/threads/worker-entry.ts` (6973a22038cc91004d98996d3b30d57c3aab5d71) — selected: [{"after":[30,31]},{"after":[77,78]}]
- `src/shared/keystore.ts` (25a4a836f3373ab48512bd52543f1a9ea943bfe4) — selected: [{"after":[11,13]},{"after":[47,48]},{"after":[53,59]},{"after":[86,87]},{"after":[101,115]},{"after":[202,202]},{"after":[259,259]},{"after":[267,267]},{"after":[269,269]},{"after":[277,277]},{"after":[291,291]},{"after":[295,326]}]
- `src/bin/insrc-connection-maintenance.ts` (4b29d7c5996ceaa9634e85ce430c57424d9c0b63) — selected: [{"after":[10,10]},{"after":[16,24]}]
- `src/daemon/__tests__/fixtures/fake-keytar.ts` (ea615bd83e9c200c3f892241ea64713b2a67260e) — selected: [{"after":[11,11]},{"after":[13,13]},{"after":[51,59]}]
- `src/daemon/__tests__/keystore-guard.test.ts` (2e757776e11a34a92672bb13df2db8265bd26f57) — selected: [{"after":[1,96]}]
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` (44e19a36ccd05763b6e753ad8ced648f85ad9543) — selected: [{"after":[6545,6551]}]
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` (fc4c6f45f7dc8a4698e9a50645574a7aa63fb93d) — selected: [{"after":[1085,1089]}]
- `src/shared/keystore.ts` (25a4a836f3373ab48512bd52543f1a9ea943bfe4) — selected: [{"after":[25,25]},{"after":[27,27]},{"after":[88,100]},{"after":[171,173]}]
- `src/shared/paths.ts` (0caba2865a80f5e7bb77f365a9e5877a1fee6b41) — selected: [{"after":[10,11]}]
- `src/assets/connection-management-inventory.json` (69d5c3eb5339b0a0f6fd10e62576d94e83b2665b) — selected: [{"after":[7810,7810]},{"after":[8023,8023]},{"after":[10278,10278]},{"after":[10959,10959]},{"after":[11904,11904]},{"after":[13327,13327]},{"after":[13611,13611]},{"after":[15843,15843]},{"after":[16315,16315]},{"after":[38266,38268]},{"after":[38329,38329]},{"after":[40069,40069]},{"after":[40127,40127]},{"after":[40136,40136]},{"after":[40143,40143]},{"after":[40149,40149]},{"after":[40152,40153]},{"after":[40235,40235]},{"after":[40247,40247]},{"after":[40502,40502]},{"after":[40507,40507]}]
- `src/daemon/__tests__/keystore-consumers.test.ts` (fdb85fd00be7a59e110b0a7b7d7f1b35cf65586a) — selected: [{"after":[1,110]}]
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` (44e19a36ccd05763b6e753ad8ced648f85ad9543) — selected: [{"after":[14168,14179]},{"after":[35719,35751]}]
- `src/daemon/handler-runtime.ts` (20e13456754e29fbdb8d3c78c22906d5c0453d34) — selected: [{"after":[1485,1485]}]
- `src/shared/keystore.ts` (25a4a836f3373ab48512bd52543f1a9ea943bfe4) — selected: [{"after":[14,18]}]
- `src/assets/connection-management-inventory.json` (69d5c3eb5339b0a0f6fd10e62576d94e83b2665b) — selected: [{"after":[8003,8018]},{"after":[8021,8022]},{"after":[10768,10775]},{"after":[10836,10879]},{"after":[10912,10939]},{"after":[10957,10958]},{"after":[12860,12999]},{"after":[13056,13063]},{"after":[13168,13175]},{"after":[13296,13299]},{"after":[13312,13315]},{"after":[13325,13326]},{"after":[13445,13450]},{"after":[13454,13454]},{"after":[13458,13458]},{"after":[13610,13610]},{"after":[15808,15811]},{"after":[15826,15826]},{"after":[15829,15830]},{"after":[15841,15842]},{"after":[38269,38292]},{"deletionAt":13603}]
- `src/daemon/db/__tests__/fixtures/driver-field-matrix.json` (6f58ab6f6c68b1ac3aeafe6f056b6d40f50be7cf) — selected: [{"after":[2376,2376]},{"after":[2380,2381]}]
- `src/assets/connection-management-inventory.json` (69d5c3eb5339b0a0f6fd10e62576d94e83b2665b) — selected: [{"after":[5600,5602]},{"after":[10294,10301]},{"after":[10347,10349]},{"after":[40000,40000]},{"after":[40128,40128]},{"deletionAt":5562}]
- `src/bin/insrc-connection-maintenance.ts` (4b29d7c5996ceaa9634e85ce430c57424d9c0b63) — selected: [{"after":[6,6]},{"after":[37,38]}]
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` (44e19a36ccd05763b6e753ad8ced648f85ad9543) — selected: [{"after":[6542,6544]},{"after":[10879,10886]},{"after":[10932,10941]},{"deletionAt":6504}]
- `src/daemon/db/management-adoption.ts` (92e61d7a4ea1e07440123f55981d925c08e64874) — selected: [{"after":[24,28]}]
- Task t1: initial; changes 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 45; identity ab49147b5cb3148d90fe4c9208665d918262c52643c840c79117f331f2dde83e
- Task t2: initial; changes 11, 17, 18, 19, 20, 21, 31, 43; identity a4c2324195f808b8d18217e65f0c394e5982d001eae485673d1907230b2a0a97
- Task t3: initial; changes 22, 23, 24, 43; identity a4bff163300951d364cdd8fb4c25dca8a9776c6b1811f7268f48c948329adb4f
- Task t4: initial; changes 0, 10, 12, 19, 22, 25, 26, 27, 28, 29, 30, 31; identity 280d1ce99f5485085c3222843fe64178d49c242dc69ccb20b9e12122977a9b68
- Task t5: initial; changes 0, 10, 12, 32, 33, 34, 35, 36, 37, 38, 46, 47, 48, 49; identity 39ec642541d244374ef450b2c34347b633ea8279844de9b8f17b278ed46d5cdc
- Task t6: initial; changes 0, 10, 12, 39, 40, 41, 42, 43, 44, 46; identity fc81eee1a8bec4486eba2e080ccf473d87b3d06e97ac860f77478e4588a5f6df

### t1: passed

Reviewed all submitted changed segments against the pinned design, plan and six acceptance checks. No blocking defects found. Owner caching, shutdown cleanup, error propagation and public compatibility are preserved.

Coverage: **verified** — Inspected test bodies and assertions for all six acceptance checks: responsive startup with zero Keychain calls; first-use opening and stable owner lease on subsequent requests; secret-unavailable during refusal and cooldown followed by successful retry; refused initialization leaving no repository state; unmanaged listing without state or secret access; and release of both on-demand owner leases at shutdown. Also inspected preload isolation, daemon launch helpers, existing initialization tests, and field/inventory audit assertions. This completes coverage assessment without claiming execution of the reviewed revision.


Optional verification and advice (nonblocking):

- Optional execution: No reviewer tests, integration checks, typecheck or build were run. Builder-reported passes are not independent execution evidence for revision 7e322e0f5cef163377553c27e68b2c1381e26975.
- The committed sequence definition was inspected. Its HTML companion is absent from the pinned design commit, so rendered appearance was not verified.

Inspected references:

- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/LLD.md`
- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/PLAN.md`
- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:.insrc/artifacts/LLD-fefa97b991537da7-s1.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/fixtures/fake-keytar.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/on-demand-open.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/connection-management-rpc.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db-rpc.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/fixtures/session-source-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/fixtures/driver-field-matrix.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/managed-store.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/management-defaults.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/management.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/secrets.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/index.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/mcp/__tests__/helpers/mcp-e2e.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/keystore.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/management-startup.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/management-tickets.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/config.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/pool-cache.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/pool.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/method-class.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/management-defaults.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/driver-field-audit.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/session-source-inventory.test.ts`

### t2: passed

Inspected every submitted changed segment against the pinned LLD, plan and all nine t2 acceptance checks. No material in-scope defects found. State ownership, mutation ordering, validation, naming and public compatibility match the design.

Coverage: **verified** — Reviewed test bodies and assertions for all nine acceptance checks: single-flight loading, five-minute refusal expiry, invalid-payload rejection without rewriting, input validation without side effects, prototype-like names across reloads, failed-write consistency and concurrent-save preservation, retirement, saving retired names again, and listing without findCredentials. Also inspected supporting on-demand, forwarding, guard, consumer and inventory assertions. This is a completed coverage assessment, not confirmation that tests executed successfully.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typecheck or build were executed during this review. Supplied pass results remain builder-reported; their cited TESTS.md is absent from the reviewed commit, so those executions were not independently verified.
- Optional execution: The real macOS Keychain dialog check remains builder-reported as not run; it belongs to t6 and does not block this t2 assessment.

Inspected references:

- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/LLD.md`
- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/PLAN.md`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/keystore.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/__tests__/keystore-vault.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/fixtures/fake-keytar.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/on-demand-open.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/fixtures/module-state-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/module-state-inventory.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-forwarding.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-guard.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-consumers.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/main-services.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/worker-entry.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/channel.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/daemon-run-files.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/bin/insrc-connection-maintenance.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/mcp/__tests__/helpers/mcp-e2e.ts`

### t3: passed

Inspected every submitted changed segment against the pinned LLD, plan and all seven acceptance checks. No material defects found. State ownership, mutation ordering, naming and public signatures remain consistent with the design.

Coverage: **verified** — Reviewed test bodies, fake-backend behavior and assertions. Coverage demonstrates first-use copying and retention across simulated runs; concurrent single-flight lookup; save/delete precedence with no extra copy; failed-copy caching and next-run retry; absence without writes or repeated lookup; per-name refusal isolation and the exact five-minute boundary; and retirement suppressing fallback. Also inspected existing vault and consumer assertions and the inventory guard. This verifies coverage assessment, not test execution.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typecheck or build were run. The supplied 19-unit-test and 3-consumer-test passes are builder-reported; their tested revision was not independently established.
- The linked sequence HTML is absent from both pinned revisions, so no visual verification is claimed. The LLD's textual state and queue contracts adequately specify this isolated migration change.

Inspected references:

- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/LLD.md`
- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/PLAN.md`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/keystore.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/__tests__/keystore-vault.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/fixtures/module-state-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/module-state-inventory.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-consumers.test.ts`

### t4: passed

Inspected all submitted changed segments against the pinned LLD, plan and five t4 acceptance checks. No material defects found. Worker forwarding preserves input errors, maps hub failures to unavailable errors without fallback, and shares the main-thread vault.

Coverage: **verified** — Reviewed the bodies and assertions for all five acceptance checks. Daemon tests assert two session-worker labels, one vault read, no worker backend calls, and visibility of a save across workers. Real MessageChannel/HubClient tests assert closed-channel failures without backend access and preservation of KeystoreInputError; the malformed-input case also exercises a real daemon worker. Main-thread validation assertions provide the comparison. Reviewed fixture instrumentation and inventory guard assertions; both changed source digests match the committed modules. This completes the coverage assessment without claiming test execution.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typecheck or build were run. The builder reports five passing forwarding tests, but the supplied report does not identify the tested commit and TESTS.md is absent from the reviewed commit; that report was not treated as execution evidence.
- Optional execution: The real macOS Keychain dialog check was not performed; it belongs to t6.
- Consider adding worker-channel delete and list assertions to complement the existing get/set coverage.

Inspected references:

- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/LLD.md`
- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/PLAN.md`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/fixtures/fake-keytar.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/mcp/__tests__/helpers/mcp-e2e.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-forwarding.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/fixtures/module-state-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/fixtures/session-source-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/main-services.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/worker-entry.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/keystore.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/channel.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/method-class.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/session-worker.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/handler-runtime.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/__tests__/keystore-vault.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-consumers.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/module-state-inventory.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/session-source-inventory.test.ts`

### t5: passed

Inspected all submitted changed segments against the pinned design, plan, and three acceptance checks. No material defects found. Guard ordering, release, maintenance ownership, naming, and compatibility are consistent with the requirements.

Coverage: **verified** — Reviewed test bodies and assertions for every acceptance check. They assert no Keychain access while guarded, immediate success after release, guard ownership during the maintenance socket check, release on refusal, and exactly one vault read during successful maintenance. Also inspected the preload fixture, process helper, inventory assertions, and store-owner boundary test. The boundary test establishes source placement; the maintenance test exercises the real entrypoint. Updated source hashes match the committed implementations.


Optional verification and advice (nonblocking):

- Optional execution: Tests, typecheck, and build were not run. Supplied passing results are builder-reported, not reviewer executions; the cited TESTS.md is absent from the reviewed commit.

Inspected references:

- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/LLD.md`
- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/PLAN.md`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/keystore.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/paths.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/daemon-run-files.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/bin/insrc-connection-maintenance.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/management-adoption.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/fixtures/fake-keytar.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/mcp/__tests__/helpers/mcp-e2e.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-guard.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/assets/connection-management-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/fixtures/session-source-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/fixtures/module-state-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/worker-stores.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/session-source-inventory.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/threads/__tests__/module-state-inventory.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/db/graph/store.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/index.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/management-enablement.ts`

### t6: changes_requested

Reviewed all submitted changed segments, pinned requirements/design, five acceptance checks and relevant test assertions. Found one test isolation defect; the selected production change is correct.

Coverage: **verified** — Inspected all three consumer test bodies and assertions, the preload and daemon helper, and inventory verification assertions. Notify asserts delivery using the vault value; web asserts a vault-backed miss and legacy lookup; keys.list/get assert returned values and one vault read. Empty-secret presence and rejected non-string writes across restart have direct assertions. The module comment covers cooldown and legacy retention. All 13 refreshed inventory entries have matching committed source hashes, internally consistent counts and site digests; the session fixture's changed source hashes also match. The web test's environment dependency is reported as a finding. The planned real-Keychain check remains unexecuted; that does not prevent completing this coverage review.

- **MED** `src/daemon/__tests__/keystore-consumers.test.ts:76-79`: Isolate BRAVE_API_KEY before exercising the missing-key web case.
  The test leaves the process environment unchanged. When the vault and legacy lookup return no key, webSearchTool falls back to BRAVE_API_KEY and calls the real search service. With a valid environment key and successful response, success is true and this assertion fails. Clear and restore the environment variable or intercept the HTTP request so the test remains deterministic and local.
  Evidence: `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-consumers.test.ts`, `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/tools/builtins/web/index.ts`

Optional verification and advice (nonblocking):

- Optional execution: Tests, typecheck and build were not run. The checkout is a9f07fc17453eb00b8ba44dde94934d91e9dcc9f, different from the reviewed revision.
- Optional execution: The builder reports three passing consumer tests under Node 22. This was not independently verified; the cited TESTS.md is absent from the reviewed commit, so the tested committed version is not established.
- Optional execution: The manual macOS Keychain dialog check was reported not run and was not performed during this review.

Inspected references:

- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/LLD.md`
- `2486e21cf46360cb32f7d00d1aaf45af2d3dd4b2:docs/standalone/open-saved-connections-demand-read-all-E20261104fefa97b9/S001/PLAN.md`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/fixtures/fake-keytar.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/mcp/__tests__/helpers/mcp-e2e.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/__tests__/keystore-consumers.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/assets/connection-management-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/fixtures/session-source-inventory.json`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/handler-runtime.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/shared/keystore.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/session-source-inventory.test.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/db/__tests__/connection-source-inventory.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/tools/config.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/tools/builtins/web/index.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/tools/builtins/notify/index.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/shutdown.ts`
- `7e322e0f5cef163377553c27e68b2c1381e26975:src/daemon/shutdown-watchdog.ts`
