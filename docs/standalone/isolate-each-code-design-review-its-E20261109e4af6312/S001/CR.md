<!-- insrc:artifact CR-e4af63128c7cbec2-s1 -->

# Code review: s1

Status: **failed** · task-based schema version 2

## worker-isolation-e4af6312-whole-story — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-12T20:08:33.816Z

16 selected task assessment(s): failed. Attribution failure (attribution_failed): Review activity CLI failed
Native output diagnostics: [{"phase":"attribution","provider":"codex","resolved":false,"errors":[{"code":"NATIVE_CLI_FAILURE","field":"/","correction":"Resolve the native CLI failure before resubmitting feedback.","occurrences":1}],"terminal":{"reason":"cli_exit","exitCode":1}}]

### Submitted scope

- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/shared/__tests__/review-resources.test.ts` — [{"after":[1,34]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/shared/review-resources.ts` — [{"after":[1,46]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` — [{"after":[1,42]},{"after":[44,84]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[1,45]},{"after":[47,66]},{"after":[68,70]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/checkpoint.ts` — [{"after":[9,10]},{"after":[32,35]},{"after":[37,38]},{"after":[79,85]},{"after":[92,92]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/contracts.ts` — [{"after":[11,12]},{"after":[107,108]},{"after":[132,148]},{"after":[150,150]},{"after":[152,165]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — [{"after":[1,45]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[6,7]},{"after":[9,9]},{"after":[51,103]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/fixtures.ts` — [{"after":[9,9]},{"after":[22,31]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[1,2]},{"after":[4,17]},{"after":[19,29]},{"after":[33,37]},{"after":[41,48]},{"after":[50,53]},{"after":[55,56]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/checkpoint.ts` — [{"after":[11,13]},{"after":[138,143]},{"after":[157,158]},{"after":[173,179]},{"after":[192,193]},{"after":[197,198]},{"after":[200,200]},{"after":[204,209]},{"after":[212,212]},{"after":[214,215]},{"after":[217,219]},{"after":[223,223]},{"after":[225,228]},{"after":[230,230]},{"after":[232,234]},{"after":[236,236]},{"after":[238,247]},{"after":[251,251]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/contracts.ts` — [{"after":[6,6]},{"after":[218,224]},{"after":[226,235]},{"after":[237,251]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — [{"after":[23,26]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[103,130]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[18,24]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/checkpoint.ts` — [{"after":[163,166]},{"after":[224,224]},{"after":[228,234]},{"after":[241,241]},{"after":[245,245]},{"deletionAt":257}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/contracts.ts` — [{"after":[225,227]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[1,70]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` — [{"after":[1,38]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[67,67]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/admission.ts` — [{"after":[71,71]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/completion.ts` — [{"after":[10,10]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/contracts.ts` — [{"after":[109,109]},{"after":[124,125]},{"after":[152,152]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/history.ts` — [{"after":[1,5]},{"after":[7,17]},{"after":[19,21]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/publication.ts` — [{"after":[10,13]},{"after":[18,19]},{"after":[24,24]},{"after":[29,35]},{"after":[37,37]},{"after":[70,70]},{"after":[78,78]},{"after":[81,83]},{"after":[100,104]},{"after":[112,133]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/record.ts` — [{"after":[6,8]},{"after":[22,26]},{"after":[40,44]},{"after":[46,46]},{"after":[50,50]},{"after":[52,57]},{"after":[79,79]},{"after":[85,85]},{"after":[90,90]},{"after":[96,109]},{"after":[114,114]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[1,3]},{"after":[5,8]},{"after":[10,74]},{"after":[77,77]},{"after":[82,83]},{"after":[85,90]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[44,45]},{"after":[47,47]},{"after":[49,50]},{"after":[53,53]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/approval.ts` — [{"after":[14,15]},{"after":[18,20]},{"after":[22,22]},{"after":[27,32]},{"after":[36,59]},{"after":[91,92]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/checkpoint.ts` — [{"after":[60,61]},{"after":[63,63]},{"after":[109,109]},{"after":[116,117]},{"after":[199,201]},{"deletionAt":203},{"after":[205,206]},{"after":[213,214]},{"after":[216,216]},{"after":[219,219]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/contracts.ts` — [{"after":[238,239]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/history.ts` — [{"after":[6,6]},{"after":[8,11]},{"after":[18,18]},{"after":[33,39]},{"after":[41,45]},{"after":[50,54]},{"after":[64,66]},{"after":[68,68]},{"after":[85,85]},{"after":[102,102]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/provenance.ts` — [{"after":[8,8]},{"after":[14,14]},{"after":[28,28]},{"after":[34,34]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/publication.ts` — [{"after":[12,12]},{"after":[15,17]},{"after":[24,28]},{"after":[43,45]},{"after":[48,49]},{"after":[65,67]},{"after":[71,75]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/read.ts` — [{"after":[5,5]},{"after":[7,8]},{"after":[11,15]},{"after":[27,31]},{"after":[35,35]},{"after":[37,37]},{"after":[41,41]},{"after":[43,43]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/results.ts` — [{"after":[16,16]},{"after":[20,20]},{"after":[138,138]},{"after":[155,155]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/report-log.ts` — [{"after":[111,111]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/resource-audit.ts` — [{"after":[1,55]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/artifact-core/codecs.ts` — [{"after":[103,103]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[13,13]},{"after":[33,35]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/coordinator.ts` — [{"after":[16,16]},{"after":[20,20]},{"after":[115,115]},{"after":[118,120]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/progress-view.ts` — [{"after":[9,9]},{"after":[16,16]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[9,9]},{"after":[17,17]},{"after":[27,30]},{"after":[80,83]},{"after":[89,102]},{"after":[104,109]},{"after":[118,121]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/contracts.ts` — [{"after":[160,160]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/coordinator.ts` — [{"after":[16,18]},{"deletionAt":31},{"after":[271,271]},{"after":[274,282]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/progress.ts` — [{"after":[4,6]},{"after":[79,93]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/publication.ts` — [{"after":[7,7]},{"after":[11,11]},{"after":[18,18]},{"after":[21,28]},{"after":[63,63]},{"after":[69,88]},{"after":[90,90]},{"after":[122,123]},{"after":[126,126]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/threads/__tests__/review-processes.test.ts` — [{"after":[1,154]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/threads/review-processes.ts` — [{"after":[1,13]},{"after":[51,139]},{"after":[141,143]},{"after":[145,179]},{"after":[182,210]},{"after":[212,213]},{"after":[215,251]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/tools/shell-helper.ts` — [{"after":[18,19]},{"after":[83,84]},{"after":[87,87]},{"after":[109,109]},{"after":[143,143]},{"after":[147,147]},{"after":[156,156]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/shared/process-group.ts` — [{"after":[23,25]},{"after":[27,46]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[1,71]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/agent/providers/cli-provider.ts` — [{"after":[71,71]},{"after":[1145,1147]},{"after":[1176,1176]},{"after":[1179,1179]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/daemon/threads/review-processes.ts` — [{"after":[14,15]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/process-group.ts` — [{"after":[24,24]},{"after":[104,105]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/review-native.ts` — [{"after":[1,35]},{"after":[37,41]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/review-process-bridge.ts` — [{"after":[1,17]},{"after":[19,21]},{"after":[23,61]},{"after":[63,69]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/agent/providers/__tests__/helpers/review-process-worker.mjs` — [{"after":[1,31]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[5,5]},{"after":[45,45]},{"after":[47,72]},{"after":[92,98]},{"after":[107,109]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/shared/review-process-bridge.ts` — [{"after":[4,4]},{"after":[23,29]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/agent/providers/__tests__/helpers/review-process-worker.mjs` — [{"after":[4,5]},{"after":[21,21]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[33,34]},{"after":[48,48]},{"after":[62,62]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/__tests__/helpers/review-shell-host.ts` — [{"after":[1,9]},{"after":[11,12]},{"after":[14,15]},{"after":[18,18]},{"after":[20,24]},{"after":[26,28]},{"after":[30,37]},{"after":[39,39]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/__tests__/review-spawn-inventory.test.ts` — [{"after":[1,21]},{"after":[23,24]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/review-processes.ts` — [{"after":[13,13]},{"after":[110,110]},{"after":[146,147]},{"after":[180,183]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[1,8]},{"after":[10,14]},{"after":[16,49]},{"after":[51,53]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[1,18]},{"after":[20,22]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/review-shell-process.ts` — [{"after":[1,62]},{"after":[64,73]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/shell-helper.ts` — [{"after":[20,21]},{"after":[103,104]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-native-guard.ts` — [{"after":[1,27]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-native.ts` — [{"after":[36,36]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-process-bridge.ts` — [{"after":[16,17]},{"after":[21,21]},{"after":[25,26]},{"after":[73,73]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/threads/__tests__/helpers/review-shell-host.ts` — [{"after":[6,8]},{"after":[10,11]},{"after":[15,15]},{"after":[18,24]},{"after":[27,30]},{"after":[32,39]},{"after":[42,42]},{"after":[46,46]},{"after":[50,50]},{"after":[59,59]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[9,9]},{"after":[12,12]},{"after":[16,16]},{"after":[31,36]},{"after":[42,56]},{"after":[72,72]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[7,9]},{"after":[22,22]},{"after":[25,31]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/threads/review-processes.ts` — [{"after":[177,177]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[32,35]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[32,33]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/review-shell-process.ts` — [{"after":[63,63]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/threads/__tests__/review-spawn-inventory.test.ts` — [{"after":[22,22]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[31,36]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[34,34]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/shared/review-native-guard.ts` — [{"after":[16,16]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/shared/vibe-session.ts` — [{"after":[7,9]},{"after":[99,104]},{"after":[225,225]},{"after":[227,231]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts` — [{"after":[1,11]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — [{"after":[1,3]},{"after":[5,10]},{"after":[12,30]},{"after":[32,32]},{"after":[36,69]},{"after":[71,94]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-admission.ts` — [{"after":[1,4]},{"after":[6,17]},{"after":[19,21]},{"after":[23,24]},{"after":[26,31]},{"after":[33,37]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[1,6]},{"after":[8,17]},{"after":[19,20]},{"after":[22,26]},{"after":[28,30]},{"after":[32,36]},{"after":[38,58]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-contract.ts` — [{"after":[1,27]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-native.ts` — [{"after":[1,34]},{"after":[36,46]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-runtime.ts` — [{"after":[1,1]},{"after":[4,15]},{"after":[17,27]},{"after":[29,36]},{"after":[41,44]},{"after":[46,48]},{"after":[50,54]},{"after":[57,58]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker.ts` — [{"after":[1,9]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/workers.ts` — [{"after":[74,79]},{"after":[81,84]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/workflow/review/design-review/coordinator.ts` — [{"after":[7,7]},{"after":[82,82]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — [{"after":[4,4]},{"after":[11,11]},{"after":[20,21]},{"after":[33,57]},{"after":[59,62]},{"after":[65,65]},{"after":[74,78]},{"after":[93,93]},{"after":[100,100]},{"after":[103,103]},{"after":[106,106]},{"after":[111,111]},{"after":[114,114]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[7,7]},{"after":[13,13]},{"after":[19,33]},{"after":[36,36]},{"after":[40,40]},{"after":[43,44]},{"after":[48,48]},{"after":[54,54]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker-runtime.ts` — [{"after":[2,3]},{"after":[12,12]},{"after":[46,46]},{"after":[53,66]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker.ts` — [{"after":[8,9]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/shared/review-native-guard.ts` — [{"after":[24,24]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[1,2]},{"after":[4,33]},{"after":[36,59]},{"after":[61,70]},{"after":[72,81]},{"after":[83,84]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-native-host.ts` — [{"after":[1,69]},{"after":[71,106]},{"after":[110,119]},{"after":[122,122]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[18,18]},{"after":[68,68]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-native.ts` — [{"after":[16,16]},{"after":[36,36]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-resources.ts` — [{"after":[1,17]},{"after":[19,30]},{"after":[32,34]},{"after":[36,37]},{"after":[39,39]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-runtime.ts` — [{"after":[26,28]},{"after":[51,52]},{"after":[71,74]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-workers.ts` — [{"after":[1,26]},{"after":[29,40]},{"after":[42,70]},{"after":[72,80]},{"after":[82,83]},{"after":[85,86]},{"after":[89,91]},{"after":[94,94]},{"after":[97,108]},{"after":[110,118]},{"after":[120,123]},{"after":[125,142]},{"after":[144,146]},{"after":[148,148]},{"after":[151,153]},{"after":[155,155]},{"after":[158,161]},{"after":[163,177]},{"after":[179,179]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/status-board.ts` — [{"after":[23,23]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/shared/review-native.ts` — [{"after":[42,47]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/shared/types.ts` — [{"after":[1242,1242]},{"after":[1249,1249]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/workflow/code-review/task-review/checkpoint.ts` — [{"after":[26,30]},{"after":[36,36]},{"after":[41,46]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[6,6]},{"after":[37,38]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[3,3]},{"after":[31,32]},{"after":[36,37]},{"after":[59,59]},{"after":[63,63]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/review-worker-runtime.ts` — [{"after":[40,40]},{"after":[51,52]},{"after":[54,54]},{"after":[56,65]},{"after":[67,67]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/review-workers.ts` — [{"after":[41,42]},{"after":[150,152]}]
- `1635e86d6bc9d87788887809913651adfb3f005c:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[14,15]},{"after":[93,111]}]
- `1635e86d6bc9d87788887809913651adfb3f005c:src/daemon/threads/review-worker-admission.ts` — [{"after":[5,5]},{"after":[18,20]},{"after":[24,24]},{"after":[27,27]},{"after":[29,29]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-worker-contract.ts` — [{"after":[16,17]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-worker-runtime.ts` — [{"after":[29,32]},{"after":[54,54]},{"after":[56,56]},{"after":[58,60]},{"after":[62,63]},{"after":[65,66]},{"after":[84,84]},{"after":[86,91]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-workers.ts` — [{"after":[24,24]},{"after":[90,90]},{"after":[95,95]},{"after":[98,101]},{"after":[154,155]},{"after":[157,158]},{"after":[161,161]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/admission.test.ts` — [{"after":[12,12]},{"after":[49,49]},{"after":[111,111]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` — [{"after":[1,29]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[1,81]},{"after":[84,84]},{"after":[86,87]},{"after":[89,99]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/admission.ts` — [{"after":[10,10]},{"after":[29,36]},{"after":[38,38]},{"after":[46,50]},{"after":[55,55]},{"after":[106,106]},{"after":[113,113]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/controller.ts` — [{"after":[57,57]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/coordinator.ts` — [{"after":[37,37]},{"after":[69,69]},{"after":[136,136]},{"after":[147,147]},{"after":[150,150]},{"after":[184,184]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/progress.ts` — [{"after":[25,25]},{"after":[29,33]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[1,26]},{"after":[28,61]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/worker-checkpoint.ts` — [{"after":[1,6]},{"after":[8,57]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-worker-admission.ts` — [{"after":[21,24]},{"after":[26,29]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-worker-contract.ts` — [{"after":[18,18]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-workers.ts` — [{"after":[86,86]},{"after":[156,156]},{"after":[159,160]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[82,82]},{"after":[85,93]},{"after":[96,96]},{"after":[98,109]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[27,31]},{"after":[50,56]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-worker-contract.ts` — [{"after":[19,19]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-worker-runtime.ts` — [{"deletionAt":16},{"after":[32,33]},{"after":[37,37]},{"after":[50,50]},{"after":[63,63]},{"after":[66,67]},{"after":[101,101]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-workers.ts` — [{"after":[83,83]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` — [{"after":[1,28]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/__tests__/worker-admission.test.ts` — [{"after":[1,2]},{"after":[4,28]},{"after":[31,32]},{"after":[34,34]},{"after":[36,49]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/coordinator.ts` — [{"after":[52,53]},{"after":[103,103]},{"after":[232,232]},{"after":[234,234]},{"after":[255,255]},{"after":[264,264]},{"after":[287,287]},{"after":[289,289]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/worker-admission.ts` — [{"after":[1,5]},{"after":[7,32]},{"after":[34,36]},{"after":[38,42]},{"after":[44,74]},{"after":[77,78]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/worker-checkpoint.ts` — [{"after":[1,18]},{"after":[20,27]},{"after":[29,30]},{"after":[32,34]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-worker-admission.ts` — [{"after":[11,11]},{"after":[41,46]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-worker-runtime.ts` — [{"after":[35,35]},{"after":[59,61]},{"after":[63,65]},{"after":[70,71]},{"after":[73,73]},{"after":[80,80]},{"after":[82,83]},{"after":[88,88]},{"after":[90,90]},{"after":[101,101]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-workers.ts` — [{"after":[18,18]},{"after":[49,49]},{"after":[98,99]},{"after":[155,163]},{"after":[172,174]},{"after":[178,178]},{"after":[186,186]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/action-admission.test.ts` — [{"after":[1,41]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` — [{"after":[9,9]},{"after":[14,19]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` — [{"after":[88,88]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/worker-admission.test.ts` — [{"after":[3,3]},{"after":[15,15]},{"after":[30,31]},{"after":[34,34]},{"after":[36,36]},{"after":[51,110]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/action-admission.ts` — [{"after":[1,21]},{"after":[23,43]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/action-state.ts` — [{"after":[1,13]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[7,7]},{"after":[18,18]},{"after":[46,47]},{"after":[51,51]},{"after":[53,54]},{"after":[71,80]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/checkpoint.ts` — [{"after":[15,15]},{"after":[35,35]},{"after":[46,46]},{"after":[59,59]},{"after":[76,76]},{"after":[126,126]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/contracts.ts` — [{"after":[70,71]},{"after":[236,236]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/coordinator.ts` — [{"deletionAt":5},{"after":[33,33]},{"after":[156,156]},{"after":[205,205]},{"after":[223,223]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/recovery-state.ts` — [{"after":[5,5]},{"after":[55,55]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/request-signature.ts` — [{"after":[1,6]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/worker-admission.ts` — [{"after":[12,13]},{"after":[23,25]},{"after":[28,28]},{"after":[39,41]},{"after":[45,46]},{"after":[50,50]},{"after":[56,84]},{"after":[96,96]},{"after":[115,116]},{"after":[118,118]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/worker-checkpoint.ts` — [{"after":[6,6]},{"after":[20,22]},{"after":[31,34]},{"after":[37,38]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[1,24]},{"after":[32,39]},{"after":[41,54]},{"after":[56,56]},{"after":[58,61]},{"after":[64,64]},{"after":[67,67]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/helpers/review-crash-daemon.ts` — [{"after":[1,13]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[1,80]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[1,2]},{"after":[5,61]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-native-host.ts` — [{"after":[121,127]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-processes.ts` — [{"after":[214,220]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-resource-recovery.ts` — [{"after":[1,23]},{"after":[25,26]},{"after":[28,40]},{"after":[42,43]},{"after":[45,67]},{"after":[69,69]},{"after":[71,74]},{"after":[76,86]},{"after":[88,89]},{"after":[91,92]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-resource-worker.ts` — [{"after":[1,22]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-worker-runtime.ts` — [{"after":[36,36]},{"after":[141,141]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-workers.ts` — [{"after":[19,21]},{"after":[66,66]},{"after":[75,75]},{"after":[96,96]},{"after":[200,200]},{"after":[203,203]},{"after":[205,205]},{"after":[208,218]},{"after":[229,229]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/shared/process-group.ts` — [{"after":[27,27]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/shared/review-resources.ts` — [{"after":[5,5]},{"after":[33,40]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[3,4]},{"after":[42,47]},{"after":[72,73]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/design-review/checkpoint.ts` — [{"after":[13,13]},{"after":[241,241]},{"after":[249,249]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/resource-recovery.ts` — [{"after":[1,24]},{"after":[26,27]},{"after":[29,64]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[23,24]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[38,40]},{"after":[42,42]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/review-worker-admission.ts` — [{"after":[32,32]},{"after":[52,52]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/review-worker-runtime.ts` — [{"after":[79,79]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[55,55]},{"after":[57,58]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[83,110]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/workflow/review/design-review/checkpoint.ts` — [{"after":[61,62]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/workflow/review/design-review/coordinator.ts` — [{"after":[235,236]},{"after":[239,239]},{"after":[247,247]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` — [{"after":[1,30]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — [{"after":[80,80]},{"after":[1892,1892]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt` — [{"after":[1,37]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt` — [{"after":[58,58]},{"after":[63,63]},{"after":[204,210]},{"after":[216,218]},{"after":[227,228]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt` — [{"after":[148,149]},{"after":[162,171]},{"after":[210,210]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt` — [{"after":[1,21]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt` — [{"after":[1,25]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/cli/panes/DaemonPane.tsx` — [{"after":[12,12]},{"after":[116,116]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[63,64]},{"after":[66,67]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/review-worker-progress.test.ts` — [{"after":[1,85]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[76,76]},{"after":[90,90]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/admin-status.ts` — [{"after":[56,56]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/main-services.ts` — [{"after":[17,17]},{"after":[168,168]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-progress.ts` — [{"after":[1,29]},{"after":[31,38]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-worker-contract.ts` — [{"after":[26,26]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-worker-runtime.ts` — [{"after":[2,3]},{"after":[38,38]},{"after":[58,64]},{"after":[84,84]},{"after":[94,94]},{"after":[155,156]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-workers.ts` — [{"after":[21,24]},{"after":[47,47]},{"after":[141,141]},{"after":[143,143]},{"after":[147,147]},{"after":[166,169]},{"after":[199,207]},{"after":[212,213]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/status-board.ts` — [{"after":[14,14]},{"after":[23,24]},{"after":[177,177]},{"after":[195,195]},{"after":[210,210]},{"after":[230,230]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/worker-entry.ts` — [{"after":[16,17]},{"after":[79,79]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/shared/review-worker-progress.ts` — [{"after":[1,28]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/shared/types.ts` — [{"after":[1246,1246]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/artifact-content.ts` — [{"after":[1,1]},{"after":[60,60]},{"after":[239,239]},{"after":[244,244]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` — [{"after":[16,16]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/review/design-review/worker-admission.ts` — [{"after":[29,29]},{"after":[118,118]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/review/worker-progress-source.ts` — [{"after":[1,10]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — [{"after":[1251,1255]},{"after":[1822,1822]},{"after":[1896,1896]},{"after":[1985,1985]},{"after":[7588,7599]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` — [{"after":[1,20]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/docs-review-client.ts` — [{"after":[36,36]},{"after":[191,191]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/docs-review-panel.ts` — [{"after":[1,1]},{"after":[107,108]},{"after":[1419,1427]},{"after":[1536,1536]},{"after":[1585,1585]},{"after":[1615,1615]},{"after":[2270,2270]},{"after":[2276,2276]},{"after":[2389,2389]},{"after":[2431,2431]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/protocol.ts` — [{"after":[157,157]},{"after":[175,176]}]
- `8cf777a4a03f39ad00f4e6fe1da26ee8c6ad1075:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[76,78]},{"after":[87,88]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/artifact-write-authority.test.ts` — [{"after":[1,31]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/helpers/artifact-writer.ts` — [{"after":[1,14]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/helpers/review-maintenance.ts` — [{"after":[1,9]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-cleanup.test.ts` — [{"after":[1,90]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-publication.test.ts` — [{"after":[1,37]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[9,37]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/artifact-write-authority.ts` — [{"after":[1,49]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/main-services.ts` — [{"after":[18,20]},{"after":[159,162]},{"after":[176,176]},{"after":[179,179]},{"after":[217,217]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[1,28]},{"after":[33,33]},{"after":[35,52]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-progress.ts` — [{"after":[30,30]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-worker-contract.ts` — [{"after":[19,20]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-worker-runtime.ts` — [{"after":[36,36]},{"after":[40,44]},{"after":[59,69]},{"after":[72,72]},{"after":[77,80]},{"after":[89,100]},{"after":[102,112]},{"after":[115,120]},{"after":[139,139]},{"after":[153,153]},{"after":[208,214]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-workers.ts` — [{"after":[26,31]},{"after":[63,63]},{"after":[77,77]},{"after":[88,88]},{"after":[91,93]},{"after":[100,100]},{"after":[110,113]},{"after":[123,123]},{"after":[126,127]},{"after":[138,138]},{"after":[152,152]},{"after":[161,161]},{"after":[193,206]},{"after":[210,210]},{"after":[222,222]},{"after":[233,233]},{"after":[260,307]},{"after":[309,319]},{"after":[324,324]},{"after":[350,358]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/worker-entry.ts` — [{"after":[17,20]},{"after":[83,88]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/workers.ts` — [{"after":[86,86]},{"after":[88,92]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/artifact-core/store.ts` — [{"after":[15,15]},{"after":[258,258]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/artifact-core/write-authority.ts` — [{"after":[1,10]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/code-review/task-review/cleanup.ts` — [{"after":[1,1]},{"after":[5,11]},{"after":[17,17]},{"after":[25,25]},{"after":[29,29]},{"after":[34,34]},{"after":[36,38]},{"after":[41,41]},{"after":[46,53]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[20,20]},{"after":[38,40]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/cleanup-owner.ts` — [{"after":[1,11]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/cleanup.ts` — [{"after":[9,12]},{"after":[15,16]},{"after":[20,21]},{"after":[43,44]},{"after":[46,47]},{"after":[54,54]},{"after":[58,58]},{"after":[62,62]},{"after":[78,78]},{"after":[96,96]},{"after":[103,103]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/coordinator.ts` — [{"after":[2,2]},{"after":[276,279]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/worker-admission.ts` — [{"after":[6,6]},{"after":[26,26]},{"after":[55,61]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/review-native-policy.test.ts` — [{"after":[1,57]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[1,2]},{"after":[4,6]},{"after":[8,9]},{"after":[11,14]},{"after":[16,21]},{"after":[23,35]},{"after":[37,45]},{"after":[47,56]},{"after":[60,62]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/task-review-plan-path.test.ts` — [{"after":[4,4]},{"deletionAt":6},{"after":[9,9]},{"after":[16,16]},{"after":[25,28]},{"after":[30,42]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/design-review-rpc.ts` — [{"after":[1,2]},{"after":[4,8]},{"after":[10,10]},{"after":[14,14]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/handler-runtime.ts` — [{"after":[146,146]},{"after":[706,707]},{"after":[975,976]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/index.ts` — [{"after":[71,72]},{"after":[271,271]},{"after":[277,280]},{"deletionAt":283},{"after":[307,307]},{"after":[417,422]},{"after":[512,512]},{"after":[662,662]},{"after":[681,681]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/review-native-policy.ts` — [{"after":[1,23]},{"after":[25,80]},{"after":[82,91]},{"after":[93,94]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/review-service.ts` — [{"after":[1,54]},{"after":[56,60]},{"after":[63,107]},{"after":[109,110]},{"after":[114,187]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/steps/design-review-step.ts` — [{"deletionAt":1},{"after":[3,4]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/steps/task-review-step.ts` — [{"deletionAt":0},{"after":[6,6]},{"after":[10,10]},{"after":[14,14]},{"after":[17,17]},{"after":[21,23]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/task-review-rpc.ts` — [{"deletionAt":0},{"after":[2,4]},{"after":[6,12]},{"after":[14,17]},{"after":[19,19]},{"after":[25,35]},{"after":[39,45]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/__tests__/helpers/review-controller.ts` — [{"after":[1,2]},{"after":[4,12]},{"after":[16,18]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[24,37]},{"after":[43,55]},{"after":[65,65]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-native-host.ts` — [{"after":[81,83]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-processes.ts` — [{"after":[106,106]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-contract.ts` — [{"after":[22,23]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-resources.ts` — [{"after":[7,8]},{"after":[20,20]},{"after":[33,33]},{"after":[37,37]},{"after":[40,40]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-runtime.ts` — [{"after":[45,45]},{"after":[52,56]},{"after":[64,65]},{"after":[77,77]},{"after":[96,104]},{"after":[129,130]},{"after":[187,188]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-workers.ts` — [{"after":[42,43]},{"after":[97,97]},{"after":[120,120]},{"after":[136,136]},{"after":[139,139]},{"after":[285,289]},{"after":[345,350]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/tools/review-git-command.ts` — [{"after":[1,15]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/tools/review-shell-process.ts` — [{"after":[5,6]},{"after":[15,15]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/__tests__/fixtures/tool-surface.golden.json` — [{"after":[492,521]},{"after":[1515,1539]},{"after":[1826,1826]},{"after":[2014,2014]},{"after":[2032,2032]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/__tests__/schema-registry.test.ts` — [{"after":[49,49]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/code-review/schema.ts` — [{"after":[6,6]},{"after":[12,13]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/design-review/schema.ts` — [{"after":[4,4]},{"after":[11,11]}]
- `07db729ca04008c97385ce38c24debee49182914:src/shared/review-native.ts` — [{"after":[24,25]}]
- `07db729ca04008c97385ce38c24debee49182914:src/shared/review-resources.ts` — [{"after":[18,21]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[8,12]},{"after":[30,39]},{"after":[48,52]},{"after":[54,58]},{"after":[63,63]},{"after":[66,67]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/controller.test.ts` — [{"after":[22,22]},{"after":[43,43]},{"after":[47,47]},{"after":[51,51]},{"after":[59,59]},{"after":[62,62]},{"after":[78,78]},{"after":[82,82]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/ownership.test.ts` — [{"after":[6,6]},{"after":[13,13]},{"after":[21,21]},{"after":[24,24]},{"after":[30,31]},{"after":[33,33]},{"after":[35,35]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/progress-client.test.ts` — [{"after":[10,11]},{"after":[20,20]},{"after":[25,25]},{"after":[30,30]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/worker-checkpoint.ts` — [{"after":[7,7]},{"after":[47,50]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/review/design-review/cleanup.ts` — [{"deletionAt":26},{"after":[82,82]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[3,6]},{"after":[10,10]},{"after":[13,13]},{"after":[16,19]},{"after":[22,22]},{"after":[29,29]},{"after":[40,44]},{"after":[48,48]},{"after":[50,50]},{"after":[52,53]},{"after":[60,61]},{"after":[63,65]},{"after":[73,80]},{"after":[84,102]},{"after":[106,115]},{"after":[117,137]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/review-service.ts` — [{"after":[61,62]},{"after":[77,77]},{"after":[108,114]},{"after":[116,116]},{"after":[119,119]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-resource-recovery.ts` — [{"after":[21,23]},{"after":[27,27]},{"after":[30,30]},{"after":[44,44]},{"after":[47,47]},{"after":[71,71]},{"after":[73,73]},{"after":[78,78]},{"after":[90,90]},{"after":[93,93]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-worker-admission.ts` — [{"after":[25,25]},{"deletionAt":26}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-worker-runtime.ts` — [{"after":[175,175]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-workers.ts` — [{"after":[108,108]},{"after":[289,289]},{"after":[314,314]},{"after":[327,327]},{"after":[329,329]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/workflow/code-review/task-review/admission.ts` — [{"after":[98,98]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[20,20]},{"after":[59,59]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[20,21]},{"after":[140,165]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/daemon/threads/review-worker-runtime.ts` — [{"after":[141,141]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[4,4]},{"after":[82,82]},{"after":[85,88]},{"after":[112,112]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts` — [{"deletionAt":2},{"after":[30,35]},{"after":[45,45]},{"after":[47,47]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/correction-admission.test.ts` — [{"after":[59,59]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/publication.test.ts` — [{"after":[99,99]},{"after":[108,112]},{"after":[114,114]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/action-admission.ts` — [{"after":[16,16]},{"after":[23,23]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[88,88]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/checkpoint.ts` — [{"after":[60,60]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/coordinator.ts` — [{"after":[131,131]},{"after":[156,156]},{"after":[168,168]},{"after":[178,178]},{"deletionAt":184},{"after":[189,189]},{"after":[199,199]},{"after":[229,229]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/__tests__/review-native-host.test.ts` — [{"after":[1,27]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[14,14]},{"after":[17,33]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/review-native-host.ts` — [{"after":[36,38]},{"after":[73,73]},{"after":[113,116]},{"after":[120,120]},{"after":[128,128]},{"after":[136,136]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/workflow/review/resource-recovery.ts` — [{"after":[25,25]},{"after":[28,28]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:design/task-review-final-scope-qualification.json` — [{"after":[350,350]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[118,118]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/__tests__/helpers/review-controller.ts` — [{"after":[3,3]},{"after":[13,27]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[57,57]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-worker-runtime.ts` — [{"after":[117,117]},{"after":[142,142]},{"after":[147,147]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-workers.ts` — [{"after":[128,128]},{"after":[136,145]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/artifact-core/codecs.ts` — [{"after":[20,20]},{"after":[104,104]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/capacity.test.ts` — [{"after":[52,52]},{"after":[66,66]},{"after":[93,93]},{"after":[109,109]},{"after":[113,113]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/cleanup.test.ts` — [{"after":[15,15]},{"after":[95,96]},{"after":[103,103]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/compatibility.test.ts` — [{"after":[30,30]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` — [{"after":[4,4]},{"after":[18,19]},{"after":[22,22]},{"after":[33,35]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[34,35]},{"after":[49,53]},{"after":[60,69]},{"after":[83,83]},{"after":[89,89]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — [{"after":[236,236]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` — [{"after":[66,66]},{"after":[85,85]},{"after":[97,97]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/history.test.ts` — [{"after":[61,61]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` — [{"after":[1,43]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts` — [{"after":[19,19]},{"after":[22,22]},{"after":[37,38]},{"after":[44,44]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/recovery.test.ts` — [{"after":[11,11]},{"after":[30,30]},{"after":[41,41]},{"after":[47,47]},{"after":[53,53]},{"after":[56,56]},{"after":[61,61]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[86,86]},{"after":[119,119]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[46,46]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/admission.ts` — [{"after":[78,78]},{"after":[80,80]},{"after":[108,108]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/capacity.ts` — [{"after":[12,12]},{"after":[85,88]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/cleanup.ts` — [{"after":[33,33]},{"after":[44,44]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/completion.ts` — [{"after":[3,3]},{"after":[12,12]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/contracts.ts` — [{"after":[118,119]},{"after":[152,152]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/history.ts` — [{"after":[6,6]},{"after":[18,18]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/publication.ts` — [{"after":[3,3]},{"after":[33,33]},{"after":[40,40]},{"after":[45,45]},{"after":[84,84]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/record.ts` — [{"after":[5,5]},{"after":[10,11]},{"after":[20,20]},{"after":[40,40]},{"after":[46,46]},{"after":[48,48]},{"after":[66,76]},{"after":[90,90]},{"after":[127,127]},{"after":[130,130]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/summary.ts` — [{"after":[7,13]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[1,8]},{"after":[10,18]},{"after":[20,27]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-fixture.ts` — [{"after":[1,57]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-native.ts` — [{"after":[1,1]},{"after":[3,10]},{"after":[12,23]},{"after":[25,40]},{"after":[42,43]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-worker-isolation.test.ts` — [{"after":[1,2]},{"after":[4,83]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[4,4]},{"after":[16,47]},{"after":[49,107]},{"after":[109,134]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[82,85]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[33,33]},{"after":[41,41]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[26,26]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-fixture.ts` — [{"after":[40,40]},{"after":[44,44]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-native.ts` — [{"after":[2,2]},{"after":[11,12]},{"after":[24,30]},{"deletionAt":31},{"after":[48,53]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-daemon.test.ts` — [{"after":[1,140]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-isolation.test.ts` — [{"after":[3,3]},{"after":[84,115]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[3,3]},{"after":[48,48]},{"after":[55,58]},{"after":[63,78]},{"after":[101,103]},{"after":[131,131]},{"after":[141,141]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/review-worker-runtime.ts` — [{"after":[183,183]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/workflow/review/design-review/worker-admission.ts` — [{"after":[27,27]},{"after":[68,73]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:docs/daemon.md` — [{"after":[1945,2012]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:docs/workflow.md` — [{"after":[20,37]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/review-native-policy.ts` — [{"after":[24,24]},{"after":[81,81]},{"after":[92,92]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/review-service.ts` — [{"after":[55,55]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[25,25]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[9,9]},{"after":[14,14]},{"after":[20,20]},{"after":[24,27]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-worker-rpc.ts` — [{"after":[1,9]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/review-worker-package.test.ts` — [{"after":[1,75]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` — [{"after":[4,4]},{"after":[7,9]},{"after":[22,22]},{"after":[29,29]},{"after":[38,39]},{"deletionAt":67}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[4,4]},{"after":[75,76]}]

### Verified final scope: 262ef49221223eb568662db6d86b1cb8a07091a3

Projection: d10f37c57761ddd87aa1bbe752adac5e6a43890a8437deb4bd5cc260fae99f39 · attribution: unmapped_failure

- `src/shared/__tests__/review-resources.test.ts` (ba4d3cd9f852aa1c2826449c5da9f4a321c508d5) — selected: [{"after":[1,34]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[1,4]},{"after":[6,17]},{"after":[22,36]},{"after":[45,59]}]
- `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` (e8465a9b0a22982d930e68e7b5f8a74bc3e986d7) — selected: [{"after":[1,42]},{"after":[44,84]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[1,45]},{"after":[47,66]},{"after":[68,70]}]
- `src/workflow/code-review/task-review/checkpoint.ts` (177b09b5d011cc7d8ee8aa97dfd79de696ee32d1) — selected: [{"after":[9,10]},{"after":[37,40]},{"after":[47,48]},{"after":[89,95]},{"after":[102,102]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[11,12]},{"after":[107,108]},{"after":[135,151]},{"after":[153,153]},{"after":[155,168]}]
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` (22569da31a6932b316ec3687e924cc59b9ac1a15) — selected: [{"after":[1,22]},{"after":[27,49]}]
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` (a38801b5a783f19a054240b98c64cad51907faa7) — selected: [{"after":[6,7]},{"after":[9,9]},{"after":[51,102]},{"after":[131,131]}]
- `src/workflow/review/design-review/__tests__/fixtures.ts` (3b5678883835fed1f3793f432e547f802da60a77) — selected: [{"after":[9,9]},{"after":[22,31]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[1,2]},{"after":[5,6]},{"after":[9,18]},{"after":[20,21]},{"after":[29,39]},{"after":[48,51]},{"after":[54,54]},{"after":[63,64]},{"after":[66,71]},{"after":[74,77]},{"after":[89,90]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[11,12]},{"after":[14,14]},{"after":[144,149]},{"after":[163,164]},{"after":[183,189]},{"after":[202,203]},{"after":[207,208]},{"after":[209,209]},{"after":[212,217]},{"after":[220,220]},{"after":[222,223]},{"after":[225,227]},{"after":[231,231]},{"after":[239,242]},{"after":[244,244]},{"after":[246,248]},{"after":[250,250]},{"after":[252,261]},{"after":[262,262]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[6,6]},{"after":[220,226]},{"after":[230,235]},{"after":[237,240]},{"after":[243,257]}]
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` (22569da31a6932b316ec3687e924cc59b9ac1a15) — selected: [{"after":[23,26]}]
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` (a38801b5a783f19a054240b98c64cad51907faa7) — selected: [{"after":[103,130]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[22,28]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[169,172]},{"after":[228,228]},{"after":[232,238]},{"after":[245,245]},{"after":[249,249]},{"deletionAt":261}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[227,229]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (66904e94f4f245dfa182d256c1240021fb54d8f0) — selected: [{"after":[1,12]},{"after":[14,32]},{"after":[36,74]}]
- `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` (69ccabd20996ecd9aebc5281e329c7991baeed94) — selected: [{"after":[1,38]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[67,67]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[83,83]}]
- `src/workflow/code-review/task-review/completion.ts` (9219d011cb4a4ca7ddec41f89537d416749ade49) — selected: [{"after":[10,10]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[109,109]},{"after":[126,127]},{"after":[154,154]}]
- `src/workflow/code-review/task-review/history.ts` (1883eee5e020e4ddb5c3c11d6bab44b1a676dfad) — selected: [{"after":[1,5]},{"after":[7,17]},{"after":[19,21]}]
- `src/workflow/code-review/task-review/publication.ts` (b7479ffb5c25569d2129c112be754657c4b6e01c) — selected: [{"after":[10,13]},{"after":[18,19]},{"after":[24,24]},{"after":[29,32]},{"after":[34,36]},{"after":[38,38]},{"after":[71,71]},{"after":[79,79]},{"after":[82,83]},{"after":[85,85]},{"after":[102,106]},{"after":[114,135]}]
- `src/workflow/code-review/task-review/record.ts` (472df7e308b5c325ab3c07b6cf34aabddd0d9a28) — selected: [{"after":[6,8]},{"after":[24,28]},{"after":[42,45]},{"after":[47,47]},{"after":[49,49]},{"after":[53,53]},{"after":[55,60]},{"after":[93,93]},{"after":[99,99]},{"after":[104,104]},{"after":[110,123]},{"after":[128,128]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[1,3]},{"after":[5,8]},{"after":[10,16]},{"after":[18,26]},{"after":[31,79]},{"after":[103,103]},{"after":[110,111]},{"after":[113,117]},{"after":[122,122]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[55,56]},{"after":[58,58]},{"after":[61,62]},{"after":[65,65]}]
- `src/workflow/review/design-review/approval.ts` (9e8b463ddb593db36210e27c13a2cb2324429795) — selected: [{"after":[14,15]},{"after":[18,20]},{"after":[22,22]},{"after":[27,32]},{"after":[36,59]},{"after":[91,92]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[65,66]},{"after":[68,68]},{"after":[114,114]},{"after":[121,122]},{"after":[204,206]},{"after":[210,211]},{"after":[218,219]},{"after":[221,221]},{"after":[224,224]},{"deletionAt":208}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[241,242]}]
- `src/workflow/review/design-review/history.ts` (81342069bcc4ea3cf0fe655f61c1f73bbb4d7e17) — selected: [{"after":[6,6]},{"after":[8,11]},{"after":[18,18]},{"after":[33,39]},{"after":[41,45]},{"after":[50,54]},{"after":[64,66]},{"after":[68,68]},{"after":[85,85]},{"after":[102,102]}]
- `src/workflow/review/design-review/provenance.ts` (2a926f45f054b1de40ba6d84d9a3712d6b692826) — selected: [{"after":[8,8]},{"after":[14,14]},{"after":[28,28]},{"after":[34,34]}]
- `src/workflow/review/design-review/publication.ts` (db4fee1b9b4ae25269e3bf39e76d1330e335afd8) — selected: [{"after":[12,12]},{"after":[15,17]},{"after":[33,37]},{"after":[52,54]},{"after":[57,58]},{"after":[95,97]},{"after":[101,105]}]
- `src/workflow/review/design-review/read.ts` (301c659f093cfe78bf64ce904e64c6ba2fd09a80) — selected: [{"after":[5,5]},{"after":[7,8]},{"after":[11,15]},{"after":[27,31]},{"after":[35,35]},{"after":[37,37]},{"after":[41,41]},{"after":[43,43]}]
- `src/workflow/review/design-review/results.ts` (0e26ac74834bebbcf77d6f7261685553886f798f) — selected: [{"after":[16,16]},{"after":[20,20]},{"after":[138,138]},{"after":[155,155]}]
- `src/workflow/review/report-log.ts` (f883d20ef1f2b2dfa3bce914e882da3cb0e7f7bd) — selected: [{"after":[111,111]}]
- `src/workflow/review/resource-audit.ts` (9171da87ed66c2cc436d4aa8b88e6f33f4a55ee9) — selected: [{"after":[1,55]}]
- `src/workflow/artifact-core/codecs.ts` (69e5943d38feb99c3b5e241ced04b1ac8a1cf06e) — selected: [{"after":[103,103]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (66904e94f4f245dfa182d256c1240021fb54d8f0) — selected: [{"after":[13,13]},{"after":[33,35]}]
- `src/workflow/code-review/task-review/coordinator.ts` (f3bddfa6764e7e58f0f9b1f7de17d84597993414) — selected: [{"after":[16,16]},{"after":[20,20]},{"after":[116,116]},{"after":[119,121]}]
- `src/workflow/code-review/task-review/progress-view.ts` (a4bf1a6b3ba751064ce7ed6f280db197d270cc89) — selected: [{"after":[9,9]},{"after":[16,16]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[9,9]},{"after":[17,17]},{"after":[27,30]},{"after":[80,81]},{"after":[83,84]},{"after":[89,102]},{"after":[104,109]},{"after":[118,121]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[162,162]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[16,18]},{"after":[266,266]},{"after":[269,269]},{"after":[274,281]},{"deletionAt":31}]
- `src/workflow/review/design-review/progress.ts` (292c1d04ea6a286cb5855d2a082df7f53fd81ee9) — selected: [{"after":[4,6]},{"after":[79,93]}]
- `src/workflow/review/design-review/publication.ts` (db4fee1b9b4ae25269e3bf39e76d1330e335afd8) — selected: [{"after":[7,7]},{"after":[11,11]},{"after":[18,18]},{"after":[21,28]},{"after":[63,63]},{"after":[69,88]},{"after":[90,90]},{"after":[122,123]},{"after":[126,126]}]
- `src/daemon/threads/__tests__/review-processes.test.ts` (8d4133bdeaa1ca486853e5f32aa4fdd4a869340b) — selected: [{"after":[1,154]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[1,12]},{"after":[14,14]},{"after":[17,105]},{"after":[107,109]},{"after":[111,145]},{"after":[148,176]},{"after":[178,179]},{"after":[184,213]},{"after":[221,227]}]
- `src/daemon/tools/shell-helper.ts` (18a95b659fb28492d774a98e9151e27e4d609fea) — selected: [{"after":[18,19]},{"after":[85,86]},{"after":[89,89]},{"after":[113,113]},{"after":[147,147]},{"after":[151,151]},{"after":[160,160]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[23,23]},{"after":[25,26]},{"after":[28,47]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (adf97699ec1cbf16719cc2760985da672f601c69) — selected: [{"after":[1,4]},{"after":[6,32]},{"after":[35,46]},{"after":[76,94]},{"after":[102,109]},{"after":[113,113]}]
- `src/agent/providers/cli-provider.ts` (e2994fe20dae211b59260ebac9ad0d54fd37dae9) — selected: [{"after":[71,71]},{"after":[1259,1261]},{"after":[1290,1290]},{"after":[1293,1293]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[15,16]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[24,24]},{"after":[104,105]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[1,23]},{"after":[26,37]},{"after":[39,43]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[1,3]},{"after":[5,15]},{"after":[18,20]},{"after":[22,24]},{"after":[34,72]},{"after":[74,80]}]
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` (84ac6d06a05b7493072376a572c176907e64c5a8) — selected: [{"after":[1,3]},{"after":[6,20]},{"after":[22,34]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (adf97699ec1cbf16719cc2760985da672f601c69) — selected: [{"after":[5,5]},{"after":[47,47]},{"after":[49,61]},{"after":[63,75]},{"after":[95,101]},{"after":[110,112]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[4,4]},{"after":[27,33]}]
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` (84ac6d06a05b7493072376a572c176907e64c5a8) — selected: [{"after":[4,5]},{"after":[21,21]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (adf97699ec1cbf16719cc2760985da672f601c69) — selected: [{"after":[33,34]},{"after":[48,48]},{"after":[62,62]}]
- `src/daemon/threads/__tests__/helpers/review-shell-host.ts` (7e459443a9ec2ea2103e18a2b5dda59018a2f139) — selected: [{"after":[1,5]},{"after":[9,9]},{"after":[12,14]},{"after":[16,17]},{"after":[25,26]},{"after":[31,31]},{"after":[40,41]},{"after":[43,45]},{"after":[47,49]},{"after":[51,58]},{"after":[60,60]}]
- `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` (7632e575bb4d1b0176464582c026edd1cd049fcb) — selected: [{"after":[1,21]},{"after":[23,24]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[13,13]},{"after":[110,110]},{"after":[146,147]},{"after":[180,183]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[1,8]},{"after":[10,11]},{"after":[13,15]},{"after":[17,30]},{"after":[47,51]},{"after":[67,81]},{"after":[83,85]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[1,6]},{"after":[10,21]},{"after":[23,24]},{"after":[35,35]}]
- `src/daemon/tools/review-shell-process.ts` (4e13c4850ff6ada3f8d8fda7b451f1295e97d08d) — selected: [{"after":[1,4]},{"after":[7,14]},{"after":[16,65]},{"after":[67,76]}]
- `src/daemon/tools/shell-helper.ts` (18a95b659fb28492d774a98e9151e27e4d609fea) — selected: [{"after":[20,21]},{"after":[103,104]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[1,15]},{"after":[17,23]},{"after":[25,29]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[38,38]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[16,17]},{"after":[21,21]},{"after":[25,26]},{"after":[73,73]}]
- `src/daemon/threads/__tests__/helpers/review-shell-host.ts` (7e459443a9ec2ea2103e18a2b5dda59018a2f139) — selected: [{"after":[6,8]},{"after":[10,11]},{"after":[15,15]},{"after":[18,24]},{"after":[27,30]},{"after":[32,39]},{"after":[42,42]},{"after":[46,46]},{"after":[50,50]},{"after":[59,59]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[9,9]},{"after":[12,12]},{"after":[16,16]},{"after":[37,37]},{"after":[42,46]},{"after":[52,66]},{"after":[82,82]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[7,9]},{"after":[22,22]},{"after":[25,31]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[177,177]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[38,41]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[32,33]}]
- `src/daemon/tools/review-shell-process.ts` (4e13c4850ff6ada3f8d8fda7b451f1295e97d08d) — selected: [{"after":[66,66]}]
- `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` (7632e575bb4d1b0176464582c026edd1cd049fcb) — selected: [{"after":[22,22]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[31,36]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[34,34]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[16,16]}]
- `src/shared/vibe-session.ts` (8fc8f510e9b2103db6483030f2117aae4b45667d) — selected: [{"after":[7,9]},{"after":[99,104]},{"after":[225,225]},{"after":[227,231]}]
- `src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts` (08bcab0aedf5328b2946842d177f5956b73d7871) — selected: [{"after":[1,11]}]
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` (847abb14bfedd1d24d8dde3d795ad854aa882c34) — selected: [{"after":[1,3]},{"after":[5,10]},{"after":[12,19]},{"after":[22,32]},{"after":[58,58]},{"after":[63,64]},{"after":[66,73]},{"after":[79,92]},{"after":[94,99]},{"after":[101,102]},{"after":[104,105]},{"after":[107,110]},{"after":[112,113]},{"after":[115,132]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[1,4]},{"after":[6,10]},{"after":[12,18]},{"after":[31,31]},{"after":[33,34]},{"after":[36,37]},{"after":[39,39]},{"after":[41,41]},{"after":[48,51]},{"after":[53,57]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[1,6]},{"after":[8,12]},{"after":[14,17]},{"after":[19,19]},{"after":[35,36]},{"after":[38,40]},{"after":[42,43]},{"after":[46,48]},{"after":[50,54]},{"after":[56,67]},{"after":[69,77]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[1,15]},{"after":[24,29]},{"after":[31,36]}]
- `src/daemon/threads/review-worker-native.ts` (6522ffb1ece3f25a8996b2355178fe86fda274b7) — selected: [{"after":[1,15]},{"after":[17,35]},{"after":[37,47]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[1,1]},{"after":[6,13]},{"after":[15,18]},{"after":[19,26]},{"after":[46,48]},{"after":[50,51]},{"after":[57,61]},{"after":[63,63]},{"after":[91,94]},{"after":[199,201]},{"after":[203,204]},{"after":[223,225]},{"after":[236,237]}]
- `src/daemon/threads/review-worker.ts` (f3d68bfc913a29e31351b9fe263dde7ea55271cc) — selected: [{"after":[1,7]},{"after":[10,11]}]
- `src/daemon/threads/workers.ts` (87dfb69b71b139ade3ea5dc0a8c718124baa1954) — selected: [{"after":[74,79]},{"after":[81,84]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[7,7]},{"after":[80,80]}]
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` (847abb14bfedd1d24d8dde3d795ad854aa882c34) — selected: [{"after":[4,4]},{"after":[11,11]},{"after":[20,21]},{"after":[33,57]},{"after":[59,62]},{"after":[65,65]},{"after":[74,78]},{"after":[93,93]},{"after":[100,100]},{"after":[103,103]},{"after":[106,106]},{"after":[111,111]},{"after":[114,114]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[7,7]},{"after":[13,13]},{"after":[20,34]},{"after":[37,37]},{"after":[41,41]},{"after":[44,45]},{"after":[49,49]},{"after":[55,55]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[4,5]},{"after":[14,14]},{"after":[95,95]},{"after":[205,216]},{"after":[221,222]}]
- `src/daemon/threads/review-worker.ts` (f3d68bfc913a29e31351b9fe263dde7ea55271cc) — selected: [{"after":[8,9]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[24,24]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[1,2]},{"after":[4,13]},{"after":[16,32]},{"after":[35,37]},{"after":[40,60]},{"after":[62,64]},{"after":[66,75]},{"after":[77,81]},{"after":[86,90]},{"after":[92,93]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[1,35]},{"after":[39,72]},{"after":[74,83]},{"after":[87,112]},{"after":[117,119]},{"after":[121,127]},{"after":[137,137]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[18,18]},{"after":[68,68]}]
- `src/daemon/threads/review-worker-native.ts` (6522ffb1ece3f25a8996b2355178fe86fda274b7) — selected: [{"after":[16,16]},{"after":[36,36]}]
- `src/daemon/threads/review-worker-resources.ts` (5e64127ff404b3f0d4a9fb7b03b2821690be8045) — selected: [{"after":[1,6]},{"after":[9,19]},{"after":[21,32]},{"after":[34,36]},{"after":[38,39]},{"after":[41,41]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[27,29]},{"after":[197,198]},{"after":[217,220]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[1,17]},{"after":[32,37]},{"after":[39,41]},{"after":[44,52]},{"after":[54,56]},{"after":[59,62]},{"after":[65,76]},{"after":[78,78]},{"after":[80,87]},{"after":[90,90]},{"after":[94,96]},{"after":[98,99]},{"after":[101,107]},{"after":[114,115]},{"after":[117,118]},{"after":[122,122]},{"after":[124,125]},{"after":[147,147]},{"after":[150,161]},{"after":[163,170]},{"after":[172,172]},{"after":[174,174]},{"after":[176,178]},{"after":[180,197]},{"after":[238,240]},{"after":[242,242]},{"after":[256,258]},{"after":[260,260]},{"after":[263,266]},{"after":[268,269]},{"after":[352,355]},{"after":[362,367]},{"after":[369,371]},{"after":[381,381]}]
- `src/daemon/threads/status-board.ts` (a120cfa7414773b3cf12e25269e9b8ac0b62b287) — selected: [{"after":[26,26]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[44,49]}]
- `src/shared/types.ts` (aeef8d881c29690e9fb152167246db81596fe6b0) — selected: [{"after":[1242,1242]},{"after":[1250,1250]}]
- `src/workflow/code-review/task-review/checkpoint.ts` (177b09b5d011cc7d8ee8aa97dfd79de696ee32d1) — selected: [{"after":[26,30]},{"after":[36,36]},{"after":[41,46]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[7,7]},{"after":[40,41]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[3,3]},{"after":[33,34]},{"after":[38,39]},{"after":[61,61]},{"after":[65,65]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[62,62]},{"after":[168,168]},{"after":[170,170]},{"after":[172,172]},{"after":[174,174]},{"after":[176,182]},{"after":[184,185]},{"after":[196,196]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[57,58]},{"after":[244,246]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[14,15]},{"after":[94,112]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[5,5]},{"after":[19,21]},{"after":[35,35]},{"after":[38,38]},{"after":[40,40]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[16,17]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[30,33]},{"after":[137,137]},{"after":[146,146]},{"after":[148,149]},{"after":[154,154]},{"after":[157,158]},{"after":[166,167]},{"after":[188,188]},{"after":[191,196]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[38,38]},{"after":[121,121]},{"after":[129,129]},{"after":[132,135]},{"after":[227,228]},{"after":[230,231]},{"after":[238,238]}]
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` (6bc57be2ba5c5c6516dc32dd50a0c5d71cb485fe) — selected: [{"after":[12,12]},{"after":[49,49]},{"after":[111,111]}]
- `src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` (4ff1c665d9b9eb017ba6b6bda7dee582ffd8a0e2) — selected: [{"after":[1,15]},{"after":[17,30]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[1,75]},{"after":[79,84]},{"after":[89,89]},{"after":[99,100]},{"after":[102,102]},{"after":[115,118]},{"after":[120,125]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[10,10]},{"after":[29,36]},{"after":[38,38]},{"after":[46,50]},{"after":[55,55]},{"after":[107,107]},{"after":[114,114]}]
- `src/workflow/code-review/task-review/controller.ts` (ac14aaa784ccca3453ca230583ad0889439efda5) — selected: [{"after":[57,57]}]
- `src/workflow/code-review/task-review/coordinator.ts` (f3bddfa6764e7e58f0f9b1f7de17d84597993414) — selected: [{"after":[37,37]},{"after":[69,69]},{"after":[136,136]},{"after":[147,147]},{"after":[150,150]},{"after":[184,184]}]
- `src/workflow/code-review/task-review/progress.ts` (487cc87ba0fc25662f66b97663666382611de1ea) — selected: [{"after":[25,25]},{"after":[29,33]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[1,19]},{"after":[22,28]},{"after":[34,38]},{"after":[42,54]},{"after":[63,78]}]
- `src/workflow/code-review/task-review/worker-checkpoint.ts` (4aa9b1d075c01474bbe7e69beecc8eaa42f2c22c) — selected: [{"after":[1,6]},{"after":[8,46]},{"after":[51,61]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[22,24]},{"after":[26,26]},{"after":[27,30]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[18,18]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[116,116]},{"after":[229,229]},{"after":[233,234]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[85,85]},{"after":[90,98]},{"after":[101,101]},{"after":[103,114]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[29,33]},{"after":[55,58]},{"after":[60,62]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[21,21]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[34,35]},{"after":[49,49]},{"after":[78,78]},{"after":[156,156]},{"after":[160,161]},{"after":[202,202]},{"deletionAt":18}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[109,109]}]
- `src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` (eda17a50675f038025efc7de7ebed675eb070318) — selected: [{"after":[1,8]},{"after":[10,13]},{"after":[20,35]}]
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` (fb547407559f54592c1223a0ad84cf5acb6d0b92) — selected: [{"after":[1,2]},{"after":[4,14]},{"after":[16,29]},{"after":[32,33]},{"after":[35,35]},{"after":[37,50]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[48,49]},{"after":[99,99]},{"after":[224,224]},{"after":[226,226]},{"after":[248,248]},{"after":[257,257]},{"after":[284,284]},{"after":[286,286]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[1,5]},{"after":[7,11]},{"after":[14,22]},{"after":[28,29]},{"after":[32,41]},{"after":[45,47]},{"after":[50,52]},{"after":[54,55]},{"after":[63,64]},{"after":[100,110]},{"after":[112,129]},{"after":[134,135]}]
- `src/workflow/review/design-review/worker-checkpoint.ts` (3ca9672ab3359ff987128bb2803506f30c56c921) — selected: [{"after":[1,5]},{"after":[7,19]},{"after":[23,30]},{"after":[35,36]},{"after":[39,41]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[11,11]},{"after":[42,47]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[37,37]},{"after":[138,140]},{"after":[143,145]},{"after":[150,151]},{"after":[153,153]},{"after":[162,162]},{"after":[164,165]},{"after":[171,171]},{"after":[173,173]},{"after":[186,186]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[18,18]},{"after":[64,64]},{"after":[130,131]},{"after":[216,219]},{"after":[221,225]},{"after":[235,237]},{"after":[241,241]},{"after":[259,259]}]
- `src/workflow/review/design-review/__tests__/action-admission.test.ts` (7f68642d753288690949c0af2063988e31b8aad5) — selected: [{"after":[1,41]}]
- `src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` (eda17a50675f038025efc7de7ebed675eb070318) — selected: [{"after":[9,9]},{"after":[14,19]}]
- `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` (22cec41c3292d63c0fa6b54d402f79f185f85b41) — selected: [{"after":[88,88]}]
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` (fb547407559f54592c1223a0ad84cf5acb6d0b92) — selected: [{"after":[3,3]},{"after":[15,15]},{"after":[30,31]},{"after":[34,34]},{"after":[36,36]},{"after":[51,110]}]
- `src/workflow/review/design-review/action-admission.ts` (ab6ad1ec6ce494d3fff4773b1a185d374593b169) — selected: [{"after":[1,15]},{"after":[17,22]},{"after":[24,44]}]
- `src/workflow/review/design-review/action-state.ts` (5b18865714599352759cb1de66bc1fbe3141d806) — selected: [{"after":[1,13]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[8,8]},{"after":[19,19]},{"after":[52,53]},{"after":[57,57]},{"after":[59,60]},{"after":[78,87]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[15,15]},{"after":[35,35]},{"after":[46,46]},{"after":[59,59]},{"after":[78,78]},{"after":[128,128]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[70,71]},{"after":[236,236]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[34,34]},{"after":[158,158]},{"after":[200,200]},{"after":[218,218]},{"deletionAt":6}]
- `src/workflow/review/design-review/recovery-state.ts` (c6c73c31a78f33f803e49683de5a373f4cab6e39) — selected: [{"after":[5,5]},{"after":[55,55]}]
- `src/workflow/review/design-review/request-signature.ts` (88db8da028054a4db14811be462597320df07dfa) — selected: [{"after":[1,6]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[12,13]},{"after":[23,25]},{"after":[30,30]},{"after":[42,44]},{"after":[48,49]},{"after":[53,53]},{"after":[65,67]},{"after":[74,99]},{"after":[111,111]},{"after":[130,131]},{"after":[133,133]}]
- `src/workflow/review/design-review/worker-checkpoint.ts` (3ca9672ab3359ff987128bb2803506f30c56c921) — selected: [{"after":[6,6]},{"after":[20,22]},{"after":[31,34]},{"after":[37,38]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[1,24]},{"after":[26,26]},{"after":[28,34]},{"after":[36,49]},{"after":[51,51]},{"after":[54,57]},{"after":[60,60]},{"after":[63,63]}]
- `src/daemon/threads/__tests__/helpers/review-crash-daemon.ts` (bbdf678ad54802ac19da69b456603bdc11476fae) — selected: [{"after":[1,13]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[1,22]},{"after":[25,82]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[1,2]},{"after":[5,8]},{"after":[199,227]},{"after":[231,231]},{"after":[233,255]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[129,135]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[214,220]}]
- `src/daemon/threads/review-resource-recovery.ts` (d91b01775a31f8d1b7c210089dd013f0ddff6ebd) — selected: [{"after":[1,20]},{"after":[24,26]},{"after":[28,29]},{"after":[31,43]},{"after":[45,46]},{"after":[48,70]},{"after":[72,72]},{"after":[74,77]},{"after":[79,89]},{"after":[91,92]},{"after":[94,95]}]
- `src/daemon/threads/review-resource-worker.ts` (6d142cc4e16267935989b0c312d5f58dd812e241) — selected: [{"after":[1,22]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[39,39]},{"after":[226,226]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[19,20]},{"after":[25,25]},{"after":[79,79]},{"after":[89,89]},{"after":[119,119]},{"after":[267,267]},{"after":[336,336]},{"after":[338,338]},{"after":[341,351]},{"after":[368,368]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[27,27]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[5,5]},{"after":[37,44]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[3,4]},{"after":[42,47]},{"after":[72,73]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[13,13]},{"after":[243,243]},{"after":[251,251]}]
- `src/workflow/review/resource-recovery.ts` (08381389a423f9bb2eb65be1c70e6ab719e7d4fa) — selected: [{"after":[1,24]},{"after":[26,27]},{"after":[29,64]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[23,24]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[228,230]},{"after":[232,232]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[32,32]},{"after":[52,52]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[159,159]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[50,50]},{"after":[52,53]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[83,110]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[61,62]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[230,231]},{"after":[234,234]},{"after":[242,242]}]
- `jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` (ca1e19e42e925efdbadb3a55eaf38f6042d4ad2e) — selected: [{"after":[1,30]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` (c47b8e0a3353032e9eca7d7882b8dc7918a675de) — selected: [{"after":[80,80]},{"after":[1892,1892]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt` (665a63907432bc5c3bfb72f86c6d5594583680e2) — selected: [{"after":[1,37]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt` (996fb1ecbb06845abebf2a162c69439f627fba8b) — selected: [{"after":[58,58]},{"after":[63,63]},{"after":[204,210]},{"after":[216,218]},{"after":[227,228]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt` (2112db8048a8c965f5a5e8195e315acb89063673) — selected: [{"after":[148,149]},{"after":[162,171]},{"after":[210,210]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt` (ee71c07947928fb2e3ef8a0e9b890d165364d027) — selected: [{"after":[1,21]}]
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt` (de0f52f7a1265eb43f8aa742d18ffd2bd1ef9807) — selected: [{"after":[1,25]}]
- `src/cli/panes/DaemonPane.tsx` (ca040df17f39ced9c5d1cc59be229a15204a1a01) — selected: [{"after":[12,12]},{"after":[116,116]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[58,59]},{"after":[61,62]}]
- `src/daemon/threads/__tests__/review-worker-progress.test.ts` (885709678b254c70cb79abc7bbf0ca51c0eea374) — selected: [{"after":[1,85]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[76,76]},{"after":[91,91]}]
- `src/daemon/threads/admin-status.ts` (db1badb68a2a7ddebd0c7a2572e9fcbe2faf6088) — selected: [{"after":[56,56]}]
- `src/daemon/threads/main-services.ts` (ce2d343e345cc636acbfe844a485c002d20124b3) — selected: [{"after":[17,17]},{"after":[175,175]}]
- `src/daemon/threads/review-progress.ts` (862c456aae7973aa63631810e07eed687666a154) — selected: [{"after":[1,29]},{"after":[31,38]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[30,30]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[2,3]},{"after":[38,38]},{"after":[80,83]},{"after":[88,90]},{"after":[152,152]},{"after":[163,163]},{"after":[234,235]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[21,24]},{"after":[53,53]},{"after":[173,173]},{"after":[175,175]},{"after":[179,179]},{"after":[198,201]},{"after":[248,256]},{"after":[261,262]}]
- `src/daemon/threads/status-board.ts` (a120cfa7414773b3cf12e25269e9b8ac0b62b287) — selected: [{"after":[14,14]},{"after":[23,24]},{"after":[177,177]},{"after":[195,195]},{"after":[210,210]},{"after":[230,230]}]
- `src/daemon/threads/worker-entry.ts` (27273dfe0a990724269155695bdacf9dc9ecdd1f) — selected: [{"after":[16,16]},{"after":[21,21]},{"after":[89,89]}]
- `src/shared/review-worker-progress.ts` (0f30b627868dbb3f1518891b2bd213c6fdc0fa5b) — selected: [{"after":[1,28]}]
- `src/shared/types.ts` (aeef8d881c29690e9fb152167246db81596fe6b0) — selected: [{"after":[1246,1246]}]
- `src/workflow/artifact-content.ts` (00b7b090dd74fa13f859aa433853bca0d8690912) — selected: [{"after":[1,1]},{"after":[60,60]},{"after":[239,239]},{"after":[244,244]}]
- `src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` (4ff1c665d9b9eb017ba6b6bda7dee582ffd8a0e2) — selected: [{"after":[16,16]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[31,31]},{"after":[132,132]}]
- `src/workflow/review/worker-progress-source.ts` (b7f6536e5ace298c76362ebc72d9508ef957c224) — selected: [{"after":[1,10]}]
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` (474effbf47015be1a30a4861648176b8f8249024) — selected: [{"after":[1251,1255]},{"after":[1822,1822]},{"after":[1896,1896]},{"after":[1985,1985]},{"after":[7588,7599]}]
- `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` (93feb2befceff0c8445622c5996e96264317bdd4) — selected: [{"after":[1,20]}]
- `vscode-plugin/src/chat/docs-review-client.ts` (1b6550cbc2b5bc770c592d001457cad3c84dbd5c) — selected: [{"after":[36,36]},{"after":[191,191]}]
- `vscode-plugin/src/chat/docs-review-panel.ts` (1070f1e78c4e316589858e50022b00a480c4284b) — selected: [{"after":[1,1]},{"after":[107,108]},{"after":[1419,1427]},{"after":[1536,1536]},{"after":[1585,1585]},{"after":[1615,1615]},{"after":[2270,2270]},{"after":[2276,2276]},{"after":[2389,2389]},{"after":[2431,2431]}]
- `vscode-plugin/src/chat/protocol.ts` (096dd23f72d4434be70bf7a6e41f396d86c69d6c) — selected: [{"after":[157,157]},{"after":[175,176]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[76,78]},{"after":[87,88]}]
- `src/daemon/threads/__tests__/artifact-write-authority.test.ts` (a8fecc016757f4f09c2db2d79b147d28d47a4345) — selected: [{"after":[1,31]}]
- `src/daemon/threads/__tests__/helpers/artifact-writer.ts` (10a15b38abf08f372cc1c85c5157a21c4212e5d2) — selected: [{"after":[1,14]}]
- `src/daemon/threads/__tests__/helpers/review-maintenance.ts` (acc725cdb4f2cb9f35604c0689c06684b8dcb2a8) — selected: [{"after":[1,9]}]
- `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` (92fe1e0f8054237c646afefea802f0f9cc7c060e) — selected: [{"after":[1,90]}]
- `src/daemon/threads/__tests__/review-worker-publication.test.ts` (c669607eba51f6f358b2297bb1e29dfa1a5d6432) — selected: [{"after":[1,37]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[9,13]},{"after":[15,15]},{"after":[176,198]}]
- `src/daemon/threads/artifact-write-authority.ts` (9f2f96a4aa1d91f2e1b8a43030edd279db8f2d57) — selected: [{"after":[1,49]}]
- `src/daemon/threads/main-services.ts` (ce2d343e345cc636acbfe844a485c002d20124b3) — selected: [{"after":[18,20]},{"after":[159,162]},{"after":[176,176]},{"after":[179,179]},{"after":[217,217]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (b8687e80dccf8d382e8aea6039453bb9b6bc8b85) — selected: [{"after":[1,23]},{"after":[38,42]},{"after":[56,56]},{"after":[58,64]},{"after":[66,76]}]
- `src/daemon/threads/review-progress.ts` (862c456aae7973aa63631810e07eed687666a154) — selected: [{"after":[30,30]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[19,20]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[36,36]},{"after":[40,44]},{"after":[66,76]},{"after":[79,79]},{"after":[84,87]},{"after":[105,116]},{"after":[118,128]},{"after":[131,136]},{"after":[155,155]},{"after":[169,169]},{"after":[227,233]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[26,31]},{"after":[63,63]},{"after":[77,77]},{"after":[88,88]},{"after":[91,93]},{"after":[100,100]},{"after":[110,113]},{"after":[123,123]},{"after":[126,127]},{"after":[148,148]},{"after":[162,162]},{"after":[171,171]},{"after":[203,216]},{"after":[220,220]},{"after":[232,232]},{"after":[243,243]},{"after":[270,294]},{"after":[301,323]},{"after":[325,335]},{"after":[340,340]},{"after":[372,380]}]
- `src/daemon/threads/worker-entry.ts` (27273dfe0a990724269155695bdacf9dc9ecdd1f) — selected: [{"after":[17,20]},{"after":[83,88]}]
- `src/daemon/threads/workers.ts` (87dfb69b71b139ade3ea5dc0a8c718124baa1954) — selected: [{"after":[86,86]},{"after":[88,92]}]
- `src/workflow/artifact-core/store.ts` (ce586c7452fb4caa21d5c135ac8154ee050dee08) — selected: [{"after":[15,15]},{"after":[258,258]}]
- `src/workflow/artifact-core/write-authority.ts` (015c6127477a7c3c75f688aa9a577d121cc683cd) — selected: [{"after":[1,10]}]
- `src/workflow/code-review/task-review/cleanup.ts` (534cc31c4201ee07464c7be9119b7334b8ab06b0) — selected: [{"after":[1,1]},{"after":[5,11]},{"after":[17,17]},{"after":[25,25]},{"after":[29,29]},{"after":[34,34]},{"after":[36,38]},{"after":[41,41]},{"after":[47,54]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[21,21]},{"after":[39,41]}]
- `src/workflow/review/cleanup-owner.ts` (24839b0ae47be63319881bafa8df3f49ebbeb318) — selected: [{"after":[1,11]}]
- `src/workflow/review/design-review/cleanup.ts` (b43d0375f863140d58003509d29181fdf708c65e) — selected: [{"after":[9,12]},{"after":[15,16]},{"after":[20,21]},{"after":[41,42]},{"after":[44,45]},{"after":[52,52]},{"after":[56,56]},{"after":[60,60]},{"after":[76,76]},{"after":[94,94]},{"after":[101,101]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[2,2]},{"after":[270,273]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[6,6]},{"after":[26,26]},{"after":[56,62]}]
- `src/daemon/__tests__/review-native-policy.test.ts` (ce1f44f69742f1568a25aa184729ee7141e415fc) — selected: [{"after":[1,57]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[1,2]},{"after":[7,9]},{"after":[11,12]},{"after":[14,15]},{"after":[22,23]},{"after":[25,30]},{"after":[32,41]},{"after":[47,49]},{"after":[51,51]},{"after":[53,53]},{"after":[56,61]},{"after":[64,64]},{"after":[68,74]},{"after":[83,85]},{"after":[105,107]}]
- `src/daemon/__tests__/task-review-plan-path.test.ts` (89eb061136daf94dc096e916435db9818311dc8f) — selected: [{"after":[4,4]},{"after":[9,9]},{"after":[16,16]},{"after":[25,28]},{"after":[30,42]},{"deletionAt":6}]
- `src/daemon/design-review-rpc.ts` (a26d9a8ea156ce2b2d1b1d685c8994ba80a3a060) — selected: [{"after":[1,2]},{"after":[4,8]},{"after":[10,10]},{"after":[14,14]}]
- `src/daemon/handler-runtime.ts` (6b7ffe45606a1713df4419a7a799473a0142fd6a) — selected: [{"after":[146,146]},{"after":[706,707]},{"after":[975,976]}]
- `src/daemon/index.ts` (30357d70d94c2d98a4c2739eb3435ff7747e8eaf) — selected: [{"after":[71,72]},{"after":[271,271]},{"after":[277,280]},{"after":[307,307]},{"after":[417,422]},{"after":[512,512]},{"after":[662,662]},{"after":[681,681]},{"deletionAt":283}]
- `src/daemon/review-native-policy.ts` (9704928a1eb2d013d94bf29c5075f2c6f94d0de9) — selected: [{"after":[1,23]},{"after":[25,80]},{"after":[82,91]},{"after":[93,94]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[1,54]},{"after":[56,60]},{"after":[63,76]},{"after":[78,107]},{"after":[115,115]},{"after":[117,118]},{"after":[120,193]}]
- `src/daemon/steps/design-review-step.ts` (a1a01bd95e60b3fcd1ae63d655ef1ce61cd5b182) — selected: [{"after":[3,4]},{"deletionAt":1}]
- `src/daemon/steps/task-review-step.ts` (49c1d070d5a70a9f5ca3c5fe5e67e4c88f2ac9e6) — selected: [{"after":[6,6]},{"after":[10,10]},{"after":[14,14]},{"after":[17,17]},{"after":[21,23]},{"deletionAt":0}]
- `src/daemon/task-review-rpc.ts` (91a21cf0a6bc598181221fcc54c7bcb2364b7fa3) — selected: [{"after":[2,4]},{"after":[6,12]},{"after":[14,17]},{"after":[19,19]},{"after":[25,35]},{"after":[39,45]},{"deletionAt":0}]
- `src/daemon/threads/__tests__/helpers/review-controller.ts` (ef6a7a6464783ed6c19d2f63c60a5a3c7aa3f439) — selected: [{"after":[1,2]},{"after":[4,12]},{"after":[28,30]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (b8687e80dccf8d382e8aea6039453bb9b6bc8b85) — selected: [{"after":[24,37]},{"after":[43,55]},{"after":[65,65]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[84,86]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[106,106]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[22,23]}]
- `src/daemon/threads/review-worker-resources.ts` (5e64127ff404b3f0d4a9fb7b03b2821690be8045) — selected: [{"after":[7,8]},{"after":[20,20]},{"after":[33,33]},{"after":[37,37]},{"after":[40,40]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[45,45]},{"after":[52,56]},{"after":[64,65]},{"after":[77,77]},{"after":[96,104]},{"after":[129,130]},{"after":[189,190]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[42,43]},{"after":[97,97]},{"after":[120,120]},{"after":[146,146]},{"after":[149,149]},{"after":[295,298]},{"after":[300,300]},{"after":[356,361]}]
- `src/daemon/tools/review-git-command.ts` (17cffae89c1a887b2d04cdfc406315224a5b9bdd) — selected: [{"after":[1,15]}]
- `src/daemon/tools/review-shell-process.ts` (4e13c4850ff6ada3f8d8fda7b451f1295e97d08d) — selected: [{"after":[5,6]},{"after":[15,15]}]
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` (7a386f453d4e91b9c5d91b51f5a218e6f175acf3) — selected: [{"after":[492,521]},{"after":[1515,1539]},{"after":[1826,1826]},{"after":[2014,2014]},{"after":[2032,2032]}]
- `src/mcp/__tests__/schema-registry.test.ts` (791625cdadbba6fb5efb1372013fce135631fd23) — selected: [{"after":[49,49]}]
- `src/mcp/code-review/schema.ts` (ee399952d8a9d5ce1e501315cd556d50d6d6ca8c) — selected: [{"after":[6,6]},{"after":[12,13]}]
- `src/mcp/design-review/schema.ts` (5fd855c8a5026c077bdeacb42a5b0f531c8170bd) — selected: [{"after":[4,4]},{"after":[11,11]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[24,25]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[18,21]}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[8,12]},{"after":[30,33]},{"after":[36,41]},{"after":[55,59]},{"after":[70,74]},{"after":[77,77]},{"after":[80,80]},{"after":[82,82]}]
- `src/workflow/code-review/task-review/__tests__/controller.test.ts` (08a34f45c4e08f57918c10d35f35e3b327981351) — selected: [{"after":[22,22]},{"after":[43,43]},{"after":[47,47]},{"after":[51,51]},{"after":[59,59]},{"after":[62,62]},{"after":[78,78]},{"after":[82,82]}]
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts` (fb01bb7a7c9c2c5a7766f2a2470096e872945a91) — selected: [{"after":[6,6]},{"after":[13,13]},{"after":[21,21]},{"after":[24,24]},{"after":[30,31]},{"after":[33,33]},{"after":[35,35]}]
- `src/workflow/code-review/task-review/__tests__/progress-client.test.ts` (ee512924291a42f77168db286e4936e07982fe45) — selected: [{"after":[10,11]},{"after":[20,20]},{"after":[25,25]},{"after":[30,30]}]
- `src/workflow/code-review/task-review/worker-checkpoint.ts` (4aa9b1d075c01474bbe7e69beecc8eaa42f2c22c) — selected: [{"after":[7,7]},{"after":[47,50]}]
- `src/workflow/review/design-review/cleanup.ts` (b43d0375f863140d58003509d29181fdf708c65e) — selected: [{"after":[82,82]},{"deletionAt":26}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[3,6]},{"after":[10,10]},{"after":[13,13]},{"after":[16,19]},{"after":[24,24]},{"after":[31,31]},{"after":[42,46]},{"after":[50,50]},{"after":[52,52]},{"after":[54,55]},{"after":[62,63]},{"after":[65,67]},{"after":[75,82]},{"after":[86,104]},{"after":[108,117]},{"after":[119,139]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[61,62]},{"after":[77,77]},{"after":[108,114]},{"after":[116,116]},{"after":[119,119]}]
- `src/daemon/threads/review-resource-recovery.ts` (d91b01775a31f8d1b7c210089dd013f0ddff6ebd) — selected: [{"after":[21,23]},{"after":[27,27]},{"after":[30,30]},{"after":[44,44]},{"after":[47,47]},{"after":[71,71]},{"after":[73,73]},{"after":[78,78]},{"after":[90,90]},{"after":[93,93]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[25,25]},{"deletionAt":26}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[175,175]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[108,108]},{"after":[299,299]},{"after":[324,324]},{"after":[337,337]},{"after":[339,339]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[98,98]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[20,20]},{"after":[59,59]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[20,21]},{"after":[140,165]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[141,141]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[4,4]},{"after":[82,82]},{"after":[85,88]},{"after":[112,112]}]
- `src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts` (b5a3f88bb67ef0f9065d850b6318a73356056471) — selected: [{"after":[30,35]},{"after":[45,45]},{"after":[47,47]},{"deletionAt":2}]
- `src/workflow/review/design-review/__tests__/correction-admission.test.ts` (e5ca4adfee8fe241f8d447785272b5dc0ae9941c) — selected: [{"after":[59,59]}]
- `src/workflow/review/design-review/__tests__/publication.test.ts` (308804a1e87a3365d7a690a0053c2e09f23a7e96) — selected: [{"after":[99,99]},{"after":[108,112]},{"after":[114,114]}]
- `src/workflow/review/design-review/action-admission.ts` (ab6ad1ec6ce494d3fff4773b1a185d374593b169) — selected: [{"after":[16,16]},{"after":[23,23]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[88,88]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[60,60]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[131,131]},{"after":[156,156]},{"after":[168,168]},{"after":[178,178]},{"after":[189,189]},{"after":[199,199]},{"after":[229,229]},{"deletionAt":184}]
- `src/daemon/threads/__tests__/review-native-host.test.ts` (2e74533027a5dc6975e09aa2b367aab60a01f46b) — selected: [{"after":[1,27]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[14,14]},{"after":[160,176]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[36,38]},{"after":[73,73]},{"after":[113,116]},{"after":[120,120]},{"after":[128,128]},{"after":[136,136]}]
- `src/workflow/review/resource-recovery.ts` (08381389a423f9bb2eb65be1c70e6ab719e7d4fa) — selected: [{"after":[25,25]},{"after":[28,28]}]
- `design/task-review-final-scope-qualification.json` (5d2fff4455fee9eb2c18188ed488031ee6da9118) — selected: [{"after":[350,350]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[118,118]}]
- `src/daemon/threads/__tests__/helpers/review-controller.ts` (ef6a7a6464783ed6c19d2f63c60a5a3c7aa3f439) — selected: [{"after":[3,3]},{"after":[13,27]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (b8687e80dccf8d382e8aea6039453bb9b6bc8b85) — selected: [{"after":[57,57]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[117,117]},{"after":[142,142]},{"after":[147,147]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[128,128]},{"after":[136,145]}]
- `src/workflow/artifact-core/codecs.ts` (69e5943d38feb99c3b5e241ced04b1ac8a1cf06e) — selected: [{"after":[20,20]},{"after":[104,104]}]
- `src/workflow/code-review/task-review/__tests__/capacity.test.ts` (999eeea19ecd03b551f4ed9aa21eee04050973f4) — selected: [{"after":[52,52]},{"after":[66,66]},{"after":[93,93]},{"after":[109,109]},{"after":[113,113]}]
- `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` (3c360f79d3c5ce9ea534701e795c85c66a15e398) — selected: [{"after":[15,15]},{"after":[95,96]},{"after":[103,103]}]
- `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` (49c2bd33c0fee42a525681ebb34a7a248c81a043) — selected: [{"after":[30,30]}]
- `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` (4ee3f548418c004ea0d8a7745ba458d9eeeb4762) — selected: [{"after":[4,4]},{"after":[18,19]},{"after":[22,22]},{"after":[33,35]}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[34,35]},{"after":[49,53]},{"after":[60,69]},{"after":[81,81]},{"after":[87,87]}]
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` (467b47808d0f3f6a9ceb57c9f6b78b40ca380c86) — selected: [{"after":[236,236]}]
- `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` (653e1404be7ea1e991626ff18a30c5d6196f9f82) — selected: [{"after":[66,66]},{"after":[85,85]},{"after":[97,97]}]
- `src/workflow/code-review/task-review/__tests__/history.test.ts` (c1df1d8015c7406752ef12a0f6c166f3fbb9c751) — selected: [{"after":[61,61]}]
- `src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` (7b18f123654f7f86f9c840a9d8042ab061297fd5) — selected: [{"after":[1,43]}]
- `src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts` (4b73991bf059d99194eff18192bc57581da658e9) — selected: [{"after":[19,19]},{"after":[22,22]},{"after":[37,38]},{"after":[44,44]}]
- `src/workflow/code-review/task-review/__tests__/recovery.test.ts` (ef2eb5ea7eff8a851988175d219e56cb8d9aef0b) — selected: [{"after":[11,11]},{"after":[30,30]},{"after":[41,41]},{"after":[47,47]},{"after":[53,53]},{"after":[56,56]},{"after":[61,61]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[86,86]},{"after":[119,119]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[46,46]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[78,78]},{"after":[80,80]},{"after":[108,108]}]
- `src/workflow/code-review/task-review/capacity.ts` (693e61df0bf8f1ebee0fdaf972558b6e95613119) — selected: [{"after":[12,12]},{"after":[85,88]}]
- `src/workflow/code-review/task-review/cleanup.ts` (534cc31c4201ee07464c7be9119b7334b8ab06b0) — selected: [{"after":[33,33]},{"after":[44,44]}]
- `src/workflow/code-review/task-review/completion.ts` (9219d011cb4a4ca7ddec41f89537d416749ade49) — selected: [{"after":[3,3]},{"after":[12,12]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[118,119]},{"after":[152,152]}]
- `src/workflow/code-review/task-review/history.ts` (1883eee5e020e4ddb5c3c11d6bab44b1a676dfad) — selected: [{"after":[6,6]},{"after":[18,18]}]
- `src/workflow/code-review/task-review/publication.ts` (b7479ffb5c25569d2129c112be754657c4b6e01c) — selected: [{"after":[3,3]},{"after":[33,33]},{"after":[40,40]},{"after":[45,45]},{"after":[84,84]}]
- `src/workflow/code-review/task-review/record.ts` (472df7e308b5c325ab3c07b6cf34aabddd0d9a28) — selected: [{"after":[5,5]},{"after":[10,11]},{"after":[20,20]},{"after":[40,40]},{"after":[46,46]},{"after":[48,48]},{"after":[66,76]},{"after":[90,90]},{"after":[127,127]},{"after":[130,130]}]
- `src/workflow/code-review/task-review/summary.ts` (9970fa2fe85c46ae13070b18f0da49292b1c2654) — selected: [{"after":[7,13]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (64f717c17da43e31f65385859d1a3408029f6383) — selected: [{"after":[1,8]},{"after":[10,13]},{"after":[15,19]},{"after":[21,23]},{"after":[28,29]},{"after":[31,33]}]
- `src/daemon/threads/__tests__/helpers/review-production-fixture.ts` (e118f2b99c90b8774a7df0dfbe7a5826988b69b4) — selected: [{"after":[1,39]},{"after":[41,43]},{"after":[45,59]}]
- `src/daemon/threads/__tests__/helpers/review-production-native.ts` (19d3eda8c7df6e941c8d14088ff9b180879dc71a) — selected: [{"after":[1,1]},{"after":[3,10]},{"after":[13,23]},{"after":[31,31]},{"after":[32,47]},{"after":[54,55]}]
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts` (cebcf075404d758051b35f03a44818ed5147e246) — selected: [{"after":[1,2]},{"after":[4,83]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[4,4]},{"after":[16,47]},{"after":[49,54]},{"after":[59,62]},{"after":[79,100]},{"after":[104,130]},{"after":[132,140]},{"after":[142,158]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[82,85]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[27,27]},{"after":[35,35]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (64f717c17da43e31f65385859d1a3408029f6383) — selected: [{"after":[30,30]}]
- `src/daemon/threads/__tests__/helpers/review-production-fixture.ts` (e118f2b99c90b8774a7df0dfbe7a5826988b69b4) — selected: [{"after":[40,40]},{"after":[44,44]}]
- `src/daemon/threads/__tests__/helpers/review-production-native.ts` (19d3eda8c7df6e941c8d14088ff9b180879dc71a) — selected: [{"after":[2,2]},{"after":[11,12]},{"after":[24,30]},{"after":[48,53]},{"deletionAt":31}]
- `src/daemon/threads/__tests__/review-worker-daemon.test.ts` (1c0e84c813dde05a5c98411d2661b40277e5649c) — selected: [{"after":[1,140]}]
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts` (cebcf075404d758051b35f03a44818ed5147e246) — selected: [{"after":[3,3]},{"after":[84,115]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[3,3]},{"after":[48,48]},{"after":[55,58]},{"after":[63,78]},{"after":[101,103]},{"after":[131,131]},{"after":[141,141]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[183,183]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[27,27]},{"after":[68,73]}]
- `docs/daemon.md` (deb2ef611d4ddb5f2b986f3c74dab122c9d1c741) — selected: [{"after":[1945,2012]}]
- `docs/workflow.md` (42d8fba864ebd58d5a4cc7f0de34ff835b8a296b) — selected: [{"after":[20,37]}]
- `src/daemon/review-native-policy.ts` (9704928a1eb2d013d94bf29c5075f2c6f94d0de9) — selected: [{"after":[24,24]},{"after":[81,81]},{"after":[92,92]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[55,55]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[25,25]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (64f717c17da43e31f65385859d1a3408029f6383) — selected: [{"after":[9,9]},{"after":[14,14]},{"after":[20,20]},{"after":[24,27]}]
- `src/daemon/threads/__tests__/helpers/review-worker-rpc.ts` (e3e8e457a8c3c12225a3441a9b17cb388cbef632) — selected: [{"after":[1,9]}]
- `src/daemon/threads/__tests__/review-worker-package.test.ts` (1e0a6bbb892ce45ed2d2da2f281fd25ee525846c) — selected: [{"after":[1,75]}]
- `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` (1cec33e92bd35f647ba5148670c20d26f8b19be3) — selected: [{"after":[4,4]},{"after":[7,9]},{"after":[22,22]},{"after":[29,29]},{"after":[38,39]},{"deletionAt":67}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[4,4]},{"after":[75,76]}]

Attribution failure (attribution_failed): Review activity CLI failed

### t1: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t2: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t3: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t4: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t5: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t6: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t7: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t8: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t9: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t10: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t11: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t12: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t13: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t14: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t15: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:


### t16: failed

No task scope was accepted. See the shared attribution failure and review diagnostics.

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- No task scope was accepted. See the shared attribution failure and review diagnostics.

Inspected references:

## worker-isolation-e4af6312-whole-story — attempt 2

Scope: whole story · reviewer: daemon · 2026-11-13T07:45:08.885Z

16 selected task assessment(s): changes_requested.

### Submitted scope

- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/shared/__tests__/review-resources.test.ts` — [{"after":[1,34]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/shared/review-resources.ts` — [{"after":[1,46]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` — [{"after":[1,42]},{"after":[44,84]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[1,45]},{"after":[47,66]},{"after":[68,70]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/checkpoint.ts` — [{"after":[9,10]},{"after":[32,35]},{"after":[37,38]},{"after":[79,85]},{"after":[92,92]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/contracts.ts` — [{"after":[11,12]},{"after":[107,108]},{"after":[132,148]},{"after":[150,150]},{"after":[152,165]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — [{"after":[1,45]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[6,7]},{"after":[9,9]},{"after":[51,103]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/fixtures.ts` — [{"after":[9,9]},{"after":[22,31]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[1,2]},{"after":[4,17]},{"after":[19,29]},{"after":[33,37]},{"after":[41,48]},{"after":[50,53]},{"after":[55,56]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/checkpoint.ts` — [{"after":[11,13]},{"after":[138,143]},{"after":[157,158]},{"after":[173,179]},{"after":[192,193]},{"after":[197,198]},{"after":[200,200]},{"after":[204,209]},{"after":[212,212]},{"after":[214,215]},{"after":[217,219]},{"after":[223,223]},{"after":[225,228]},{"after":[230,230]},{"after":[232,234]},{"after":[236,236]},{"after":[238,247]},{"after":[251,251]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/contracts.ts` — [{"after":[6,6]},{"after":[218,224]},{"after":[226,235]},{"after":[237,251]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — [{"after":[23,26]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[103,130]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[18,24]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/checkpoint.ts` — [{"after":[163,166]},{"after":[224,224]},{"after":[228,234]},{"after":[241,241]},{"after":[245,245]},{"deletionAt":257}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/contracts.ts` — [{"after":[225,227]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[1,70]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` — [{"after":[1,38]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[67,67]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/admission.ts` — [{"after":[71,71]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/completion.ts` — [{"after":[10,10]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/contracts.ts` — [{"after":[109,109]},{"after":[124,125]},{"after":[152,152]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/history.ts` — [{"after":[1,5]},{"after":[7,17]},{"after":[19,21]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/publication.ts` — [{"after":[10,13]},{"after":[18,19]},{"after":[24,24]},{"after":[29,35]},{"after":[37,37]},{"after":[70,70]},{"after":[78,78]},{"after":[81,83]},{"after":[100,104]},{"after":[112,133]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/record.ts` — [{"after":[6,8]},{"after":[22,26]},{"after":[40,44]},{"after":[46,46]},{"after":[50,50]},{"after":[52,57]},{"after":[79,79]},{"after":[85,85]},{"after":[90,90]},{"after":[96,109]},{"after":[114,114]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[1,3]},{"after":[5,8]},{"after":[10,74]},{"after":[77,77]},{"after":[82,83]},{"after":[85,90]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[44,45]},{"after":[47,47]},{"after":[49,50]},{"after":[53,53]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/approval.ts` — [{"after":[14,15]},{"after":[18,20]},{"after":[22,22]},{"after":[27,32]},{"after":[36,59]},{"after":[91,92]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/checkpoint.ts` — [{"after":[60,61]},{"after":[63,63]},{"after":[109,109]},{"after":[116,117]},{"after":[199,201]},{"deletionAt":203},{"after":[205,206]},{"after":[213,214]},{"after":[216,216]},{"after":[219,219]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/contracts.ts` — [{"after":[238,239]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/history.ts` — [{"after":[6,6]},{"after":[8,11]},{"after":[18,18]},{"after":[33,39]},{"after":[41,45]},{"after":[50,54]},{"after":[64,66]},{"after":[68,68]},{"after":[85,85]},{"after":[102,102]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/provenance.ts` — [{"after":[8,8]},{"after":[14,14]},{"after":[28,28]},{"after":[34,34]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/publication.ts` — [{"after":[12,12]},{"after":[15,17]},{"after":[24,28]},{"after":[43,45]},{"after":[48,49]},{"after":[65,67]},{"after":[71,75]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/read.ts` — [{"after":[5,5]},{"after":[7,8]},{"after":[11,15]},{"after":[27,31]},{"after":[35,35]},{"after":[37,37]},{"after":[41,41]},{"after":[43,43]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/results.ts` — [{"after":[16,16]},{"after":[20,20]},{"after":[138,138]},{"after":[155,155]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/report-log.ts` — [{"after":[111,111]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/resource-audit.ts` — [{"after":[1,55]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/artifact-core/codecs.ts` — [{"after":[103,103]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[13,13]},{"after":[33,35]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/coordinator.ts` — [{"after":[16,16]},{"after":[20,20]},{"after":[115,115]},{"after":[118,120]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/progress-view.ts` — [{"after":[9,9]},{"after":[16,16]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[9,9]},{"after":[17,17]},{"after":[27,30]},{"after":[80,83]},{"after":[89,102]},{"after":[104,109]},{"after":[118,121]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/contracts.ts` — [{"after":[160,160]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/coordinator.ts` — [{"after":[16,18]},{"deletionAt":31},{"after":[271,271]},{"after":[274,282]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/progress.ts` — [{"after":[4,6]},{"after":[79,93]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/publication.ts` — [{"after":[7,7]},{"after":[11,11]},{"after":[18,18]},{"after":[21,28]},{"after":[63,63]},{"after":[69,88]},{"after":[90,90]},{"after":[122,123]},{"after":[126,126]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/threads/__tests__/review-processes.test.ts` — [{"after":[1,154]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/threads/review-processes.ts` — [{"after":[1,13]},{"after":[51,139]},{"after":[141,143]},{"after":[145,179]},{"after":[182,210]},{"after":[212,213]},{"after":[215,251]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/tools/shell-helper.ts` — [{"after":[18,19]},{"after":[83,84]},{"after":[87,87]},{"after":[109,109]},{"after":[143,143]},{"after":[147,147]},{"after":[156,156]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/shared/process-group.ts` — [{"after":[23,25]},{"after":[27,46]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[1,71]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/agent/providers/cli-provider.ts` — [{"after":[71,71]},{"after":[1145,1147]},{"after":[1176,1176]},{"after":[1179,1179]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/daemon/threads/review-processes.ts` — [{"after":[14,15]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/process-group.ts` — [{"after":[24,24]},{"after":[104,105]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/review-native.ts` — [{"after":[1,35]},{"after":[37,41]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/review-process-bridge.ts` — [{"after":[1,17]},{"after":[19,21]},{"after":[23,61]},{"after":[63,69]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/agent/providers/__tests__/helpers/review-process-worker.mjs` — [{"after":[1,31]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[5,5]},{"after":[45,45]},{"after":[47,72]},{"after":[92,98]},{"after":[107,109]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/shared/review-process-bridge.ts` — [{"after":[4,4]},{"after":[23,29]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/agent/providers/__tests__/helpers/review-process-worker.mjs` — [{"after":[4,5]},{"after":[21,21]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[33,34]},{"after":[48,48]},{"after":[62,62]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/__tests__/helpers/review-shell-host.ts` — [{"after":[1,9]},{"after":[11,12]},{"after":[14,15]},{"after":[18,18]},{"after":[20,24]},{"after":[26,28]},{"after":[30,37]},{"after":[39,39]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/__tests__/review-spawn-inventory.test.ts` — [{"after":[1,21]},{"after":[23,24]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/review-processes.ts` — [{"after":[13,13]},{"after":[110,110]},{"after":[146,147]},{"after":[180,183]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[1,8]},{"after":[10,14]},{"after":[16,49]},{"after":[51,53]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[1,18]},{"after":[20,22]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/review-shell-process.ts` — [{"after":[1,62]},{"after":[64,73]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/shell-helper.ts` — [{"after":[20,21]},{"after":[103,104]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-native-guard.ts` — [{"after":[1,27]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-native.ts` — [{"after":[36,36]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-process-bridge.ts` — [{"after":[16,17]},{"after":[21,21]},{"after":[25,26]},{"after":[73,73]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/threads/__tests__/helpers/review-shell-host.ts` — [{"after":[6,8]},{"after":[10,11]},{"after":[15,15]},{"after":[18,24]},{"after":[27,30]},{"after":[32,39]},{"after":[42,42]},{"after":[46,46]},{"after":[50,50]},{"after":[59,59]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[9,9]},{"after":[12,12]},{"after":[16,16]},{"after":[31,36]},{"after":[42,56]},{"after":[72,72]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[7,9]},{"after":[22,22]},{"after":[25,31]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/threads/review-processes.ts` — [{"after":[177,177]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[32,35]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[32,33]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/review-shell-process.ts` — [{"after":[63,63]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/threads/__tests__/review-spawn-inventory.test.ts` — [{"after":[22,22]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[31,36]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[34,34]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/shared/review-native-guard.ts` — [{"after":[16,16]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/shared/vibe-session.ts` — [{"after":[7,9]},{"after":[99,104]},{"after":[225,225]},{"after":[227,231]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts` — [{"after":[1,11]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — [{"after":[1,3]},{"after":[5,10]},{"after":[12,30]},{"after":[32,32]},{"after":[36,69]},{"after":[71,94]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-admission.ts` — [{"after":[1,4]},{"after":[6,17]},{"after":[19,21]},{"after":[23,24]},{"after":[26,31]},{"after":[33,37]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[1,6]},{"after":[8,17]},{"after":[19,20]},{"after":[22,26]},{"after":[28,30]},{"after":[32,36]},{"after":[38,58]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-contract.ts` — [{"after":[1,27]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-native.ts` — [{"after":[1,34]},{"after":[36,46]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-runtime.ts` — [{"after":[1,1]},{"after":[4,15]},{"after":[17,27]},{"after":[29,36]},{"after":[41,44]},{"after":[46,48]},{"after":[50,54]},{"after":[57,58]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker.ts` — [{"after":[1,9]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/workers.ts` — [{"after":[74,79]},{"after":[81,84]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/workflow/review/design-review/coordinator.ts` — [{"after":[7,7]},{"after":[82,82]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — [{"after":[4,4]},{"after":[11,11]},{"after":[20,21]},{"after":[33,57]},{"after":[59,62]},{"after":[65,65]},{"after":[74,78]},{"after":[93,93]},{"after":[100,100]},{"after":[103,103]},{"after":[106,106]},{"after":[111,111]},{"after":[114,114]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[7,7]},{"after":[13,13]},{"after":[19,33]},{"after":[36,36]},{"after":[40,40]},{"after":[43,44]},{"after":[48,48]},{"after":[54,54]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker-runtime.ts` — [{"after":[2,3]},{"after":[12,12]},{"after":[46,46]},{"after":[53,66]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker.ts` — [{"after":[8,9]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/shared/review-native-guard.ts` — [{"after":[24,24]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[1,2]},{"after":[4,33]},{"after":[36,59]},{"after":[61,70]},{"after":[72,81]},{"after":[83,84]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-native-host.ts` — [{"after":[1,69]},{"after":[71,106]},{"after":[110,119]},{"after":[122,122]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[18,18]},{"after":[68,68]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-native.ts` — [{"after":[16,16]},{"after":[36,36]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-resources.ts` — [{"after":[1,17]},{"after":[19,30]},{"after":[32,34]},{"after":[36,37]},{"after":[39,39]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-runtime.ts` — [{"after":[26,28]},{"after":[51,52]},{"after":[71,74]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-workers.ts` — [{"after":[1,26]},{"after":[29,40]},{"after":[42,70]},{"after":[72,80]},{"after":[82,83]},{"after":[85,86]},{"after":[89,91]},{"after":[94,94]},{"after":[97,108]},{"after":[110,118]},{"after":[120,123]},{"after":[125,142]},{"after":[144,146]},{"after":[148,148]},{"after":[151,153]},{"after":[155,155]},{"after":[158,161]},{"after":[163,177]},{"after":[179,179]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/status-board.ts` — [{"after":[23,23]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/shared/review-native.ts` — [{"after":[42,47]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/shared/types.ts` — [{"after":[1242,1242]},{"after":[1249,1249]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/workflow/code-review/task-review/checkpoint.ts` — [{"after":[26,30]},{"after":[36,36]},{"after":[41,46]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[6,6]},{"after":[37,38]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[3,3]},{"after":[31,32]},{"after":[36,37]},{"after":[59,59]},{"after":[63,63]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/review-worker-runtime.ts` — [{"after":[40,40]},{"after":[51,52]},{"after":[54,54]},{"after":[56,65]},{"after":[67,67]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/review-workers.ts` — [{"after":[41,42]},{"after":[150,152]}]
- `1635e86d6bc9d87788887809913651adfb3f005c:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[14,15]},{"after":[93,111]}]
- `1635e86d6bc9d87788887809913651adfb3f005c:src/daemon/threads/review-worker-admission.ts` — [{"after":[5,5]},{"after":[18,20]},{"after":[24,24]},{"after":[27,27]},{"after":[29,29]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-worker-contract.ts` — [{"after":[16,17]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-worker-runtime.ts` — [{"after":[29,32]},{"after":[54,54]},{"after":[56,56]},{"after":[58,60]},{"after":[62,63]},{"after":[65,66]},{"after":[84,84]},{"after":[86,91]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-workers.ts` — [{"after":[24,24]},{"after":[90,90]},{"after":[95,95]},{"after":[98,101]},{"after":[154,155]},{"after":[157,158]},{"after":[161,161]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/admission.test.ts` — [{"after":[12,12]},{"after":[49,49]},{"after":[111,111]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` — [{"after":[1,29]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[1,81]},{"after":[84,84]},{"after":[86,87]},{"after":[89,99]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/admission.ts` — [{"after":[10,10]},{"after":[29,36]},{"after":[38,38]},{"after":[46,50]},{"after":[55,55]},{"after":[106,106]},{"after":[113,113]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/controller.ts` — [{"after":[57,57]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/coordinator.ts` — [{"after":[37,37]},{"after":[69,69]},{"after":[136,136]},{"after":[147,147]},{"after":[150,150]},{"after":[184,184]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/progress.ts` — [{"after":[25,25]},{"after":[29,33]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[1,26]},{"after":[28,61]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/worker-checkpoint.ts` — [{"after":[1,6]},{"after":[8,57]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-worker-admission.ts` — [{"after":[21,24]},{"after":[26,29]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-worker-contract.ts` — [{"after":[18,18]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-workers.ts` — [{"after":[86,86]},{"after":[156,156]},{"after":[159,160]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[82,82]},{"after":[85,93]},{"after":[96,96]},{"after":[98,109]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[27,31]},{"after":[50,56]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-worker-contract.ts` — [{"after":[19,19]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-worker-runtime.ts` — [{"deletionAt":16},{"after":[32,33]},{"after":[37,37]},{"after":[50,50]},{"after":[63,63]},{"after":[66,67]},{"after":[101,101]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-workers.ts` — [{"after":[83,83]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` — [{"after":[1,28]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/__tests__/worker-admission.test.ts` — [{"after":[1,2]},{"after":[4,28]},{"after":[31,32]},{"after":[34,34]},{"after":[36,49]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/coordinator.ts` — [{"after":[52,53]},{"after":[103,103]},{"after":[232,232]},{"after":[234,234]},{"after":[255,255]},{"after":[264,264]},{"after":[287,287]},{"after":[289,289]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/worker-admission.ts` — [{"after":[1,5]},{"after":[7,32]},{"after":[34,36]},{"after":[38,42]},{"after":[44,74]},{"after":[77,78]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/worker-checkpoint.ts` — [{"after":[1,18]},{"after":[20,27]},{"after":[29,30]},{"after":[32,34]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-worker-admission.ts` — [{"after":[11,11]},{"after":[41,46]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-worker-runtime.ts` — [{"after":[35,35]},{"after":[59,61]},{"after":[63,65]},{"after":[70,71]},{"after":[73,73]},{"after":[80,80]},{"after":[82,83]},{"after":[88,88]},{"after":[90,90]},{"after":[101,101]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-workers.ts` — [{"after":[18,18]},{"after":[49,49]},{"after":[98,99]},{"after":[155,163]},{"after":[172,174]},{"after":[178,178]},{"after":[186,186]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/action-admission.test.ts` — [{"after":[1,41]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` — [{"after":[9,9]},{"after":[14,19]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` — [{"after":[88,88]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/worker-admission.test.ts` — [{"after":[3,3]},{"after":[15,15]},{"after":[30,31]},{"after":[34,34]},{"after":[36,36]},{"after":[51,110]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/action-admission.ts` — [{"after":[1,21]},{"after":[23,43]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/action-state.ts` — [{"after":[1,13]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[7,7]},{"after":[18,18]},{"after":[46,47]},{"after":[51,51]},{"after":[53,54]},{"after":[71,80]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/checkpoint.ts` — [{"after":[15,15]},{"after":[35,35]},{"after":[46,46]},{"after":[59,59]},{"after":[76,76]},{"after":[126,126]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/contracts.ts` — [{"after":[70,71]},{"after":[236,236]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/coordinator.ts` — [{"deletionAt":5},{"after":[33,33]},{"after":[156,156]},{"after":[205,205]},{"after":[223,223]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/recovery-state.ts` — [{"after":[5,5]},{"after":[55,55]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/request-signature.ts` — [{"after":[1,6]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/worker-admission.ts` — [{"after":[12,13]},{"after":[23,25]},{"after":[28,28]},{"after":[39,41]},{"after":[45,46]},{"after":[50,50]},{"after":[56,84]},{"after":[96,96]},{"after":[115,116]},{"after":[118,118]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/worker-checkpoint.ts` — [{"after":[6,6]},{"after":[20,22]},{"after":[31,34]},{"after":[37,38]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[1,24]},{"after":[32,39]},{"after":[41,54]},{"after":[56,56]},{"after":[58,61]},{"after":[64,64]},{"after":[67,67]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/helpers/review-crash-daemon.ts` — [{"after":[1,13]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[1,80]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[1,2]},{"after":[5,61]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-native-host.ts` — [{"after":[121,127]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-processes.ts` — [{"after":[214,220]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-resource-recovery.ts` — [{"after":[1,23]},{"after":[25,26]},{"after":[28,40]},{"after":[42,43]},{"after":[45,67]},{"after":[69,69]},{"after":[71,74]},{"after":[76,86]},{"after":[88,89]},{"after":[91,92]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-resource-worker.ts` — [{"after":[1,22]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-worker-runtime.ts` — [{"after":[36,36]},{"after":[141,141]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-workers.ts` — [{"after":[19,21]},{"after":[66,66]},{"after":[75,75]},{"after":[96,96]},{"after":[200,200]},{"after":[203,203]},{"after":[205,205]},{"after":[208,218]},{"after":[229,229]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/shared/process-group.ts` — [{"after":[27,27]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/shared/review-resources.ts` — [{"after":[5,5]},{"after":[33,40]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[3,4]},{"after":[42,47]},{"after":[72,73]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/design-review/checkpoint.ts` — [{"after":[13,13]},{"after":[241,241]},{"after":[249,249]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/resource-recovery.ts` — [{"after":[1,24]},{"after":[26,27]},{"after":[29,64]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[23,24]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[38,40]},{"after":[42,42]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/review-worker-admission.ts` — [{"after":[32,32]},{"after":[52,52]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/review-worker-runtime.ts` — [{"after":[79,79]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[55,55]},{"after":[57,58]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[83,110]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/workflow/review/design-review/checkpoint.ts` — [{"after":[61,62]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/workflow/review/design-review/coordinator.ts` — [{"after":[235,236]},{"after":[239,239]},{"after":[247,247]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` — [{"after":[1,30]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — [{"after":[80,80]},{"after":[1892,1892]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt` — [{"after":[1,37]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt` — [{"after":[58,58]},{"after":[63,63]},{"after":[204,210]},{"after":[216,218]},{"after":[227,228]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt` — [{"after":[148,149]},{"after":[162,171]},{"after":[210,210]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt` — [{"after":[1,21]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt` — [{"after":[1,25]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/cli/panes/DaemonPane.tsx` — [{"after":[12,12]},{"after":[116,116]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[63,64]},{"after":[66,67]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/review-worker-progress.test.ts` — [{"after":[1,85]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[76,76]},{"after":[90,90]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/admin-status.ts` — [{"after":[56,56]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/main-services.ts` — [{"after":[17,17]},{"after":[168,168]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-progress.ts` — [{"after":[1,29]},{"after":[31,38]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-worker-contract.ts` — [{"after":[26,26]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-worker-runtime.ts` — [{"after":[2,3]},{"after":[38,38]},{"after":[58,64]},{"after":[84,84]},{"after":[94,94]},{"after":[155,156]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-workers.ts` — [{"after":[21,24]},{"after":[47,47]},{"after":[141,141]},{"after":[143,143]},{"after":[147,147]},{"after":[166,169]},{"after":[199,207]},{"after":[212,213]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/status-board.ts` — [{"after":[14,14]},{"after":[23,24]},{"after":[177,177]},{"after":[195,195]},{"after":[210,210]},{"after":[230,230]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/worker-entry.ts` — [{"after":[16,17]},{"after":[79,79]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/shared/review-worker-progress.ts` — [{"after":[1,28]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/shared/types.ts` — [{"after":[1246,1246]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/artifact-content.ts` — [{"after":[1,1]},{"after":[60,60]},{"after":[239,239]},{"after":[244,244]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` — [{"after":[16,16]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/review/design-review/worker-admission.ts` — [{"after":[29,29]},{"after":[118,118]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/review/worker-progress-source.ts` — [{"after":[1,10]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — [{"after":[1251,1255]},{"after":[1822,1822]},{"after":[1896,1896]},{"after":[1985,1985]},{"after":[7588,7599]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` — [{"after":[1,20]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/docs-review-client.ts` — [{"after":[36,36]},{"after":[191,191]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/docs-review-panel.ts` — [{"after":[1,1]},{"after":[107,108]},{"after":[1419,1427]},{"after":[1536,1536]},{"after":[1585,1585]},{"after":[1615,1615]},{"after":[2270,2270]},{"after":[2276,2276]},{"after":[2389,2389]},{"after":[2431,2431]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/protocol.ts` — [{"after":[157,157]},{"after":[175,176]}]
- `8cf777a4a03f39ad00f4e6fe1da26ee8c6ad1075:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[76,78]},{"after":[87,88]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/artifact-write-authority.test.ts` — [{"after":[1,31]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/helpers/artifact-writer.ts` — [{"after":[1,14]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/helpers/review-maintenance.ts` — [{"after":[1,9]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-cleanup.test.ts` — [{"after":[1,90]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-publication.test.ts` — [{"after":[1,37]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[9,37]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/artifact-write-authority.ts` — [{"after":[1,49]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/main-services.ts` — [{"after":[18,20]},{"after":[159,162]},{"after":[176,176]},{"after":[179,179]},{"after":[217,217]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[1,28]},{"after":[33,33]},{"after":[35,52]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-progress.ts` — [{"after":[30,30]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-worker-contract.ts` — [{"after":[19,20]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-worker-runtime.ts` — [{"after":[36,36]},{"after":[40,44]},{"after":[59,69]},{"after":[72,72]},{"after":[77,80]},{"after":[89,100]},{"after":[102,112]},{"after":[115,120]},{"after":[139,139]},{"after":[153,153]},{"after":[208,214]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-workers.ts` — [{"after":[26,31]},{"after":[63,63]},{"after":[77,77]},{"after":[88,88]},{"after":[91,93]},{"after":[100,100]},{"after":[110,113]},{"after":[123,123]},{"after":[126,127]},{"after":[138,138]},{"after":[152,152]},{"after":[161,161]},{"after":[193,206]},{"after":[210,210]},{"after":[222,222]},{"after":[233,233]},{"after":[260,307]},{"after":[309,319]},{"after":[324,324]},{"after":[350,358]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/worker-entry.ts` — [{"after":[17,20]},{"after":[83,88]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/workers.ts` — [{"after":[86,86]},{"after":[88,92]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/artifact-core/store.ts` — [{"after":[15,15]},{"after":[258,258]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/artifact-core/write-authority.ts` — [{"after":[1,10]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/code-review/task-review/cleanup.ts` — [{"after":[1,1]},{"after":[5,11]},{"after":[17,17]},{"after":[25,25]},{"after":[29,29]},{"after":[34,34]},{"after":[36,38]},{"after":[41,41]},{"after":[46,53]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[20,20]},{"after":[38,40]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/cleanup-owner.ts` — [{"after":[1,11]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/cleanup.ts` — [{"after":[9,12]},{"after":[15,16]},{"after":[20,21]},{"after":[43,44]},{"after":[46,47]},{"after":[54,54]},{"after":[58,58]},{"after":[62,62]},{"after":[78,78]},{"after":[96,96]},{"after":[103,103]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/coordinator.ts` — [{"after":[2,2]},{"after":[276,279]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/worker-admission.ts` — [{"after":[6,6]},{"after":[26,26]},{"after":[55,61]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/review-native-policy.test.ts` — [{"after":[1,57]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[1,2]},{"after":[4,6]},{"after":[8,9]},{"after":[11,14]},{"after":[16,21]},{"after":[23,35]},{"after":[37,45]},{"after":[47,56]},{"after":[60,62]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/task-review-plan-path.test.ts` — [{"after":[4,4]},{"deletionAt":6},{"after":[9,9]},{"after":[16,16]},{"after":[25,28]},{"after":[30,42]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/design-review-rpc.ts` — [{"after":[1,2]},{"after":[4,8]},{"after":[10,10]},{"after":[14,14]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/handler-runtime.ts` — [{"after":[146,146]},{"after":[706,707]},{"after":[975,976]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/index.ts` — [{"after":[71,72]},{"after":[271,271]},{"after":[277,280]},{"deletionAt":283},{"after":[307,307]},{"after":[417,422]},{"after":[512,512]},{"after":[662,662]},{"after":[681,681]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/review-native-policy.ts` — [{"after":[1,23]},{"after":[25,80]},{"after":[82,91]},{"after":[93,94]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/review-service.ts` — [{"after":[1,54]},{"after":[56,60]},{"after":[63,107]},{"after":[109,110]},{"after":[114,187]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/steps/design-review-step.ts` — [{"deletionAt":1},{"after":[3,4]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/steps/task-review-step.ts` — [{"deletionAt":0},{"after":[6,6]},{"after":[10,10]},{"after":[14,14]},{"after":[17,17]},{"after":[21,23]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/task-review-rpc.ts` — [{"deletionAt":0},{"after":[2,4]},{"after":[6,12]},{"after":[14,17]},{"after":[19,19]},{"after":[25,35]},{"after":[39,45]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/__tests__/helpers/review-controller.ts` — [{"after":[1,2]},{"after":[4,12]},{"after":[16,18]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[24,37]},{"after":[43,55]},{"after":[65,65]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-native-host.ts` — [{"after":[81,83]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-processes.ts` — [{"after":[106,106]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-contract.ts` — [{"after":[22,23]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-resources.ts` — [{"after":[7,8]},{"after":[20,20]},{"after":[33,33]},{"after":[37,37]},{"after":[40,40]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-runtime.ts` — [{"after":[45,45]},{"after":[52,56]},{"after":[64,65]},{"after":[77,77]},{"after":[96,104]},{"after":[129,130]},{"after":[187,188]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-workers.ts` — [{"after":[42,43]},{"after":[97,97]},{"after":[120,120]},{"after":[136,136]},{"after":[139,139]},{"after":[285,289]},{"after":[345,350]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/tools/review-git-command.ts` — [{"after":[1,15]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/tools/review-shell-process.ts` — [{"after":[5,6]},{"after":[15,15]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/__tests__/fixtures/tool-surface.golden.json` — [{"after":[492,521]},{"after":[1515,1539]},{"after":[1826,1826]},{"after":[2014,2014]},{"after":[2032,2032]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/__tests__/schema-registry.test.ts` — [{"after":[49,49]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/code-review/schema.ts` — [{"after":[6,6]},{"after":[12,13]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/design-review/schema.ts` — [{"after":[4,4]},{"after":[11,11]}]
- `07db729ca04008c97385ce38c24debee49182914:src/shared/review-native.ts` — [{"after":[24,25]}]
- `07db729ca04008c97385ce38c24debee49182914:src/shared/review-resources.ts` — [{"after":[18,21]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[8,12]},{"after":[30,39]},{"after":[48,52]},{"after":[54,58]},{"after":[63,63]},{"after":[66,67]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/controller.test.ts` — [{"after":[22,22]},{"after":[43,43]},{"after":[47,47]},{"after":[51,51]},{"after":[59,59]},{"after":[62,62]},{"after":[78,78]},{"after":[82,82]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/ownership.test.ts` — [{"after":[6,6]},{"after":[13,13]},{"after":[21,21]},{"after":[24,24]},{"after":[30,31]},{"after":[33,33]},{"after":[35,35]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/progress-client.test.ts` — [{"after":[10,11]},{"after":[20,20]},{"after":[25,25]},{"after":[30,30]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/worker-checkpoint.ts` — [{"after":[7,7]},{"after":[47,50]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/review/design-review/cleanup.ts` — [{"deletionAt":26},{"after":[82,82]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[3,6]},{"after":[10,10]},{"after":[13,13]},{"after":[16,19]},{"after":[22,22]},{"after":[29,29]},{"after":[40,44]},{"after":[48,48]},{"after":[50,50]},{"after":[52,53]},{"after":[60,61]},{"after":[63,65]},{"after":[73,80]},{"after":[84,102]},{"after":[106,115]},{"after":[117,137]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/review-service.ts` — [{"after":[61,62]},{"after":[77,77]},{"after":[108,114]},{"after":[116,116]},{"after":[119,119]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-resource-recovery.ts` — [{"after":[21,23]},{"after":[27,27]},{"after":[30,30]},{"after":[44,44]},{"after":[47,47]},{"after":[71,71]},{"after":[73,73]},{"after":[78,78]},{"after":[90,90]},{"after":[93,93]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-worker-admission.ts` — [{"after":[25,25]},{"deletionAt":26}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-worker-runtime.ts` — [{"after":[175,175]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-workers.ts` — [{"after":[108,108]},{"after":[289,289]},{"after":[314,314]},{"after":[327,327]},{"after":[329,329]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/workflow/code-review/task-review/admission.ts` — [{"after":[98,98]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[20,20]},{"after":[59,59]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[20,21]},{"after":[140,165]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/daemon/threads/review-worker-runtime.ts` — [{"after":[141,141]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[4,4]},{"after":[82,82]},{"after":[85,88]},{"after":[112,112]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts` — [{"deletionAt":2},{"after":[30,35]},{"after":[45,45]},{"after":[47,47]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/correction-admission.test.ts` — [{"after":[59,59]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/publication.test.ts` — [{"after":[99,99]},{"after":[108,112]},{"after":[114,114]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/action-admission.ts` — [{"after":[16,16]},{"after":[23,23]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[88,88]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/checkpoint.ts` — [{"after":[60,60]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/coordinator.ts` — [{"after":[131,131]},{"after":[156,156]},{"after":[168,168]},{"after":[178,178]},{"deletionAt":184},{"after":[189,189]},{"after":[199,199]},{"after":[229,229]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/__tests__/review-native-host.test.ts` — [{"after":[1,27]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[14,14]},{"after":[17,33]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/review-native-host.ts` — [{"after":[36,38]},{"after":[73,73]},{"after":[113,116]},{"after":[120,120]},{"after":[128,128]},{"after":[136,136]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/workflow/review/resource-recovery.ts` — [{"after":[25,25]},{"after":[28,28]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:design/task-review-final-scope-qualification.json` — [{"after":[350,350]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[118,118]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/__tests__/helpers/review-controller.ts` — [{"after":[3,3]},{"after":[13,27]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[57,57]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-worker-runtime.ts` — [{"after":[117,117]},{"after":[142,142]},{"after":[147,147]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-workers.ts` — [{"after":[128,128]},{"after":[136,145]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/artifact-core/codecs.ts` — [{"after":[20,20]},{"after":[104,104]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/capacity.test.ts` — [{"after":[52,52]},{"after":[66,66]},{"after":[93,93]},{"after":[109,109]},{"after":[113,113]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/cleanup.test.ts` — [{"after":[15,15]},{"after":[95,96]},{"after":[103,103]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/compatibility.test.ts` — [{"after":[30,30]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` — [{"after":[4,4]},{"after":[18,19]},{"after":[22,22]},{"after":[33,35]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[34,35]},{"after":[49,53]},{"after":[60,69]},{"after":[83,83]},{"after":[89,89]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — [{"after":[236,236]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` — [{"after":[66,66]},{"after":[85,85]},{"after":[97,97]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/history.test.ts` — [{"after":[61,61]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` — [{"after":[1,43]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts` — [{"after":[19,19]},{"after":[22,22]},{"after":[37,38]},{"after":[44,44]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/recovery.test.ts` — [{"after":[11,11]},{"after":[30,30]},{"after":[41,41]},{"after":[47,47]},{"after":[53,53]},{"after":[56,56]},{"after":[61,61]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[86,86]},{"after":[119,119]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[46,46]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/admission.ts` — [{"after":[78,78]},{"after":[80,80]},{"after":[108,108]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/capacity.ts` — [{"after":[12,12]},{"after":[85,88]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/cleanup.ts` — [{"after":[33,33]},{"after":[44,44]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/completion.ts` — [{"after":[3,3]},{"after":[12,12]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/contracts.ts` — [{"after":[118,119]},{"after":[152,152]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/history.ts` — [{"after":[6,6]},{"after":[18,18]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/publication.ts` — [{"after":[3,3]},{"after":[33,33]},{"after":[40,40]},{"after":[45,45]},{"after":[84,84]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/record.ts` — [{"after":[5,5]},{"after":[10,11]},{"after":[20,20]},{"after":[40,40]},{"after":[46,46]},{"after":[48,48]},{"after":[66,76]},{"after":[90,90]},{"after":[127,127]},{"after":[130,130]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/summary.ts` — [{"after":[7,13]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[1,8]},{"after":[10,18]},{"after":[20,27]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-fixture.ts` — [{"after":[1,57]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-native.ts` — [{"after":[1,1]},{"after":[3,10]},{"after":[12,23]},{"after":[25,40]},{"after":[42,43]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-worker-isolation.test.ts` — [{"after":[1,2]},{"after":[4,83]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[4,4]},{"after":[16,47]},{"after":[49,107]},{"after":[109,134]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[82,85]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[33,33]},{"after":[41,41]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[26,26]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-fixture.ts` — [{"after":[40,40]},{"after":[44,44]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-native.ts` — [{"after":[2,2]},{"after":[11,12]},{"after":[24,30]},{"deletionAt":31},{"after":[48,53]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-daemon.test.ts` — [{"after":[1,140]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-isolation.test.ts` — [{"after":[3,3]},{"after":[84,115]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[3,3]},{"after":[48,48]},{"after":[55,58]},{"after":[63,78]},{"after":[101,103]},{"after":[131,131]},{"after":[141,141]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/review-worker-runtime.ts` — [{"after":[183,183]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/workflow/review/design-review/worker-admission.ts` — [{"after":[27,27]},{"after":[68,73]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:docs/daemon.md` — [{"after":[1945,2012]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:docs/workflow.md` — [{"after":[20,37]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/review-native-policy.ts` — [{"after":[24,24]},{"after":[81,81]},{"after":[92,92]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/review-service.ts` — [{"after":[55,55]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[25,25]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[9,9]},{"after":[14,14]},{"after":[20,20]},{"after":[24,27]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-worker-rpc.ts` — [{"after":[1,9]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/review-worker-package.test.ts` — [{"after":[1,75]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` — [{"after":[4,4]},{"after":[7,9]},{"after":[22,22]},{"after":[29,29]},{"after":[38,39]},{"deletionAt":67}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[4,4]},{"after":[75,76]}]

### Verified final scope: 262ef49221223eb568662db6d86b1cb8a07091a3

Projection: d10f37c57761ddd87aa1bbe752adac5e6a43890a8437deb4bd5cc260fae99f39 · attribution: accepted

- `src/shared/__tests__/review-resources.test.ts` (ba4d3cd9f852aa1c2826449c5da9f4a321c508d5) — selected: [{"after":[1,34]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[1,4]},{"after":[6,17]},{"after":[22,36]},{"after":[45,59]}]
- `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` (e8465a9b0a22982d930e68e7b5f8a74bc3e986d7) — selected: [{"after":[1,42]},{"after":[44,84]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[1,45]},{"after":[47,66]},{"after":[68,70]}]
- `src/workflow/code-review/task-review/checkpoint.ts` (177b09b5d011cc7d8ee8aa97dfd79de696ee32d1) — selected: [{"after":[9,10]},{"after":[37,40]},{"after":[47,48]},{"after":[89,95]},{"after":[102,102]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[11,12]},{"after":[107,108]},{"after":[135,151]},{"after":[153,153]},{"after":[155,168]}]
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` (22569da31a6932b316ec3687e924cc59b9ac1a15) — selected: [{"after":[1,22]},{"after":[27,49]}]
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` (a38801b5a783f19a054240b98c64cad51907faa7) — selected: [{"after":[6,7]},{"after":[9,9]},{"after":[51,102]},{"after":[131,131]}]
- `src/workflow/review/design-review/__tests__/fixtures.ts` (3b5678883835fed1f3793f432e547f802da60a77) — selected: [{"after":[9,9]},{"after":[22,31]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[1,2]},{"after":[5,6]},{"after":[9,18]},{"after":[20,21]},{"after":[29,39]},{"after":[48,51]},{"after":[54,54]},{"after":[63,64]},{"after":[66,71]},{"after":[74,77]},{"after":[89,90]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[11,12]},{"after":[14,14]},{"after":[144,149]},{"after":[163,164]},{"after":[183,189]},{"after":[202,203]},{"after":[207,208]},{"after":[209,209]},{"after":[212,217]},{"after":[220,220]},{"after":[222,223]},{"after":[225,227]},{"after":[231,231]},{"after":[239,242]},{"after":[244,244]},{"after":[246,248]},{"after":[250,250]},{"after":[252,261]},{"after":[262,262]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[6,6]},{"after":[220,226]},{"after":[230,235]},{"after":[237,240]},{"after":[243,257]}]
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` (22569da31a6932b316ec3687e924cc59b9ac1a15) — selected: [{"after":[23,26]}]
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` (a38801b5a783f19a054240b98c64cad51907faa7) — selected: [{"after":[103,130]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[22,28]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[169,172]},{"after":[228,228]},{"after":[232,238]},{"after":[245,245]},{"after":[249,249]},{"deletionAt":261}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[227,229]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (66904e94f4f245dfa182d256c1240021fb54d8f0) — selected: [{"after":[1,12]},{"after":[14,32]},{"after":[36,74]}]
- `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` (69ccabd20996ecd9aebc5281e329c7991baeed94) — selected: [{"after":[1,38]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[67,67]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[83,83]}]
- `src/workflow/code-review/task-review/completion.ts` (9219d011cb4a4ca7ddec41f89537d416749ade49) — selected: [{"after":[10,10]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[109,109]},{"after":[126,127]},{"after":[154,154]}]
- `src/workflow/code-review/task-review/history.ts` (1883eee5e020e4ddb5c3c11d6bab44b1a676dfad) — selected: [{"after":[1,5]},{"after":[7,17]},{"after":[19,21]}]
- `src/workflow/code-review/task-review/publication.ts` (b7479ffb5c25569d2129c112be754657c4b6e01c) — selected: [{"after":[10,13]},{"after":[18,19]},{"after":[24,24]},{"after":[29,32]},{"after":[34,36]},{"after":[38,38]},{"after":[71,71]},{"after":[79,79]},{"after":[82,83]},{"after":[85,85]},{"after":[102,106]},{"after":[114,135]}]
- `src/workflow/code-review/task-review/record.ts` (472df7e308b5c325ab3c07b6cf34aabddd0d9a28) — selected: [{"after":[6,8]},{"after":[24,28]},{"after":[42,45]},{"after":[47,47]},{"after":[49,49]},{"after":[53,53]},{"after":[55,60]},{"after":[93,93]},{"after":[99,99]},{"after":[104,104]},{"after":[110,123]},{"after":[128,128]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[1,3]},{"after":[5,8]},{"after":[10,16]},{"after":[18,26]},{"after":[31,79]},{"after":[103,103]},{"after":[110,111]},{"after":[113,117]},{"after":[122,122]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[55,56]},{"after":[58,58]},{"after":[61,62]},{"after":[65,65]}]
- `src/workflow/review/design-review/approval.ts` (9e8b463ddb593db36210e27c13a2cb2324429795) — selected: [{"after":[14,15]},{"after":[18,20]},{"after":[22,22]},{"after":[27,32]},{"after":[36,59]},{"after":[91,92]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[65,66]},{"after":[68,68]},{"after":[114,114]},{"after":[121,122]},{"after":[204,206]},{"after":[210,211]},{"after":[218,219]},{"after":[221,221]},{"after":[224,224]},{"deletionAt":208}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[241,242]}]
- `src/workflow/review/design-review/history.ts` (81342069bcc4ea3cf0fe655f61c1f73bbb4d7e17) — selected: [{"after":[6,6]},{"after":[8,11]},{"after":[18,18]},{"after":[33,39]},{"after":[41,45]},{"after":[50,54]},{"after":[64,66]},{"after":[68,68]},{"after":[85,85]},{"after":[102,102]}]
- `src/workflow/review/design-review/provenance.ts` (2a926f45f054b1de40ba6d84d9a3712d6b692826) — selected: [{"after":[8,8]},{"after":[14,14]},{"after":[28,28]},{"after":[34,34]}]
- `src/workflow/review/design-review/publication.ts` (db4fee1b9b4ae25269e3bf39e76d1330e335afd8) — selected: [{"after":[12,12]},{"after":[15,17]},{"after":[33,37]},{"after":[52,54]},{"after":[57,58]},{"after":[95,97]},{"after":[101,105]}]
- `src/workflow/review/design-review/read.ts` (301c659f093cfe78bf64ce904e64c6ba2fd09a80) — selected: [{"after":[5,5]},{"after":[7,8]},{"after":[11,15]},{"after":[27,31]},{"after":[35,35]},{"after":[37,37]},{"after":[41,41]},{"after":[43,43]}]
- `src/workflow/review/design-review/results.ts` (0e26ac74834bebbcf77d6f7261685553886f798f) — selected: [{"after":[16,16]},{"after":[20,20]},{"after":[138,138]},{"after":[155,155]}]
- `src/workflow/review/report-log.ts` (f883d20ef1f2b2dfa3bce914e882da3cb0e7f7bd) — selected: [{"after":[111,111]}]
- `src/workflow/review/resource-audit.ts` (9171da87ed66c2cc436d4aa8b88e6f33f4a55ee9) — selected: [{"after":[1,55]}]
- `src/workflow/artifact-core/codecs.ts` (69e5943d38feb99c3b5e241ced04b1ac8a1cf06e) — selected: [{"after":[103,103]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (66904e94f4f245dfa182d256c1240021fb54d8f0) — selected: [{"after":[13,13]},{"after":[33,35]}]
- `src/workflow/code-review/task-review/coordinator.ts` (f3bddfa6764e7e58f0f9b1f7de17d84597993414) — selected: [{"after":[16,16]},{"after":[20,20]},{"after":[116,116]},{"after":[119,121]}]
- `src/workflow/code-review/task-review/progress-view.ts` (a4bf1a6b3ba751064ce7ed6f280db197d270cc89) — selected: [{"after":[9,9]},{"after":[16,16]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[9,9]},{"after":[17,17]},{"after":[27,30]},{"after":[80,81]},{"after":[83,84]},{"after":[89,102]},{"after":[104,109]},{"after":[118,121]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[162,162]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[16,18]},{"after":[266,266]},{"after":[269,269]},{"after":[274,281]},{"deletionAt":31}]
- `src/workflow/review/design-review/progress.ts` (292c1d04ea6a286cb5855d2a082df7f53fd81ee9) — selected: [{"after":[4,6]},{"after":[79,93]}]
- `src/workflow/review/design-review/publication.ts` (db4fee1b9b4ae25269e3bf39e76d1330e335afd8) — selected: [{"after":[7,7]},{"after":[11,11]},{"after":[18,18]},{"after":[21,28]},{"after":[63,63]},{"after":[69,88]},{"after":[90,90]},{"after":[122,123]},{"after":[126,126]}]
- `src/daemon/threads/__tests__/review-processes.test.ts` (8d4133bdeaa1ca486853e5f32aa4fdd4a869340b) — selected: [{"after":[1,154]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[1,12]},{"after":[14,14]},{"after":[17,105]},{"after":[107,109]},{"after":[111,145]},{"after":[148,176]},{"after":[178,179]},{"after":[184,213]},{"after":[221,227]}]
- `src/daemon/tools/shell-helper.ts` (18a95b659fb28492d774a98e9151e27e4d609fea) — selected: [{"after":[18,19]},{"after":[85,86]},{"after":[89,89]},{"after":[113,113]},{"after":[147,147]},{"after":[151,151]},{"after":[160,160]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[23,23]},{"after":[25,26]},{"after":[28,47]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (adf97699ec1cbf16719cc2760985da672f601c69) — selected: [{"after":[1,4]},{"after":[6,32]},{"after":[35,46]},{"after":[76,94]},{"after":[102,109]},{"after":[113,113]}]
- `src/agent/providers/cli-provider.ts` (e2994fe20dae211b59260ebac9ad0d54fd37dae9) — selected: [{"after":[71,71]},{"after":[1259,1261]},{"after":[1290,1290]},{"after":[1293,1293]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[15,16]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[24,24]},{"after":[104,105]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[1,23]},{"after":[26,37]},{"after":[39,43]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[1,3]},{"after":[5,15]},{"after":[18,20]},{"after":[22,24]},{"after":[34,72]},{"after":[74,80]}]
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` (84ac6d06a05b7493072376a572c176907e64c5a8) — selected: [{"after":[1,3]},{"after":[6,20]},{"after":[22,34]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (adf97699ec1cbf16719cc2760985da672f601c69) — selected: [{"after":[5,5]},{"after":[47,47]},{"after":[49,61]},{"after":[63,75]},{"after":[95,101]},{"after":[110,112]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[4,4]},{"after":[27,33]}]
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` (84ac6d06a05b7493072376a572c176907e64c5a8) — selected: [{"after":[4,5]},{"after":[21,21]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (adf97699ec1cbf16719cc2760985da672f601c69) — selected: [{"after":[33,34]},{"after":[48,48]},{"after":[62,62]}]
- `src/daemon/threads/__tests__/helpers/review-shell-host.ts` (7e459443a9ec2ea2103e18a2b5dda59018a2f139) — selected: [{"after":[1,5]},{"after":[9,9]},{"after":[12,14]},{"after":[16,17]},{"after":[25,26]},{"after":[31,31]},{"after":[40,41]},{"after":[43,45]},{"after":[47,49]},{"after":[51,58]},{"after":[60,60]}]
- `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` (7632e575bb4d1b0176464582c026edd1cd049fcb) — selected: [{"after":[1,21]},{"after":[23,24]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[13,13]},{"after":[110,110]},{"after":[146,147]},{"after":[180,183]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[1,8]},{"after":[10,11]},{"after":[13,15]},{"after":[17,30]},{"after":[47,51]},{"after":[67,81]},{"after":[83,85]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[1,6]},{"after":[10,21]},{"after":[23,24]},{"after":[35,35]}]
- `src/daemon/tools/review-shell-process.ts` (4e13c4850ff6ada3f8d8fda7b451f1295e97d08d) — selected: [{"after":[1,4]},{"after":[7,14]},{"after":[16,65]},{"after":[67,76]}]
- `src/daemon/tools/shell-helper.ts` (18a95b659fb28492d774a98e9151e27e4d609fea) — selected: [{"after":[20,21]},{"after":[103,104]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[1,15]},{"after":[17,23]},{"after":[25,29]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[38,38]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[16,17]},{"after":[21,21]},{"after":[25,26]},{"after":[73,73]}]
- `src/daemon/threads/__tests__/helpers/review-shell-host.ts` (7e459443a9ec2ea2103e18a2b5dda59018a2f139) — selected: [{"after":[6,8]},{"after":[10,11]},{"after":[15,15]},{"after":[18,24]},{"after":[27,30]},{"after":[32,39]},{"after":[42,42]},{"after":[46,46]},{"after":[50,50]},{"after":[59,59]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[9,9]},{"after":[12,12]},{"after":[16,16]},{"after":[37,37]},{"after":[42,46]},{"after":[52,66]},{"after":[82,82]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[7,9]},{"after":[22,22]},{"after":[25,31]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[177,177]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[38,41]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[32,33]}]
- `src/daemon/tools/review-shell-process.ts` (4e13c4850ff6ada3f8d8fda7b451f1295e97d08d) — selected: [{"after":[66,66]}]
- `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` (7632e575bb4d1b0176464582c026edd1cd049fcb) — selected: [{"after":[22,22]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[31,36]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[34,34]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[16,16]}]
- `src/shared/vibe-session.ts` (8fc8f510e9b2103db6483030f2117aae4b45667d) — selected: [{"after":[7,9]},{"after":[99,104]},{"after":[225,225]},{"after":[227,231]}]
- `src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts` (08bcab0aedf5328b2946842d177f5956b73d7871) — selected: [{"after":[1,11]}]
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` (847abb14bfedd1d24d8dde3d795ad854aa882c34) — selected: [{"after":[1,3]},{"after":[5,10]},{"after":[12,19]},{"after":[22,32]},{"after":[58,58]},{"after":[63,64]},{"after":[66,73]},{"after":[79,92]},{"after":[94,99]},{"after":[101,102]},{"after":[104,105]},{"after":[107,110]},{"after":[112,113]},{"after":[115,132]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[1,4]},{"after":[6,10]},{"after":[12,18]},{"after":[31,31]},{"after":[33,34]},{"after":[36,37]},{"after":[39,39]},{"after":[41,41]},{"after":[48,51]},{"after":[53,57]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[1,6]},{"after":[8,12]},{"after":[14,17]},{"after":[19,19]},{"after":[35,36]},{"after":[38,40]},{"after":[42,43]},{"after":[46,48]},{"after":[50,54]},{"after":[56,67]},{"after":[69,77]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[1,15]},{"after":[24,29]},{"after":[31,36]}]
- `src/daemon/threads/review-worker-native.ts` (6522ffb1ece3f25a8996b2355178fe86fda274b7) — selected: [{"after":[1,15]},{"after":[17,35]},{"after":[37,47]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[1,1]},{"after":[6,13]},{"after":[15,18]},{"after":[19,26]},{"after":[46,48]},{"after":[50,51]},{"after":[57,61]},{"after":[63,63]},{"after":[91,94]},{"after":[199,201]},{"after":[203,204]},{"after":[223,225]},{"after":[236,237]}]
- `src/daemon/threads/review-worker.ts` (f3d68bfc913a29e31351b9fe263dde7ea55271cc) — selected: [{"after":[1,7]},{"after":[10,11]}]
- `src/daemon/threads/workers.ts` (87dfb69b71b139ade3ea5dc0a8c718124baa1954) — selected: [{"after":[74,79]},{"after":[81,84]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[7,7]},{"after":[80,80]}]
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` (847abb14bfedd1d24d8dde3d795ad854aa882c34) — selected: [{"after":[4,4]},{"after":[11,11]},{"after":[20,21]},{"after":[33,57]},{"after":[59,62]},{"after":[65,65]},{"after":[74,78]},{"after":[93,93]},{"after":[100,100]},{"after":[103,103]},{"after":[106,106]},{"after":[111,111]},{"after":[114,114]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[7,7]},{"after":[13,13]},{"after":[20,34]},{"after":[37,37]},{"after":[41,41]},{"after":[44,45]},{"after":[49,49]},{"after":[55,55]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[4,5]},{"after":[14,14]},{"after":[95,95]},{"after":[205,216]},{"after":[221,222]}]
- `src/daemon/threads/review-worker.ts` (f3d68bfc913a29e31351b9fe263dde7ea55271cc) — selected: [{"after":[8,9]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[24,24]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[1,2]},{"after":[4,13]},{"after":[16,32]},{"after":[35,37]},{"after":[40,60]},{"after":[62,64]},{"after":[66,75]},{"after":[77,81]},{"after":[86,90]},{"after":[92,93]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[1,35]},{"after":[39,72]},{"after":[74,83]},{"after":[87,112]},{"after":[117,119]},{"after":[121,127]},{"after":[137,137]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[18,18]},{"after":[68,68]}]
- `src/daemon/threads/review-worker-native.ts` (6522ffb1ece3f25a8996b2355178fe86fda274b7) — selected: [{"after":[16,16]},{"after":[36,36]}]
- `src/daemon/threads/review-worker-resources.ts` (5e64127ff404b3f0d4a9fb7b03b2821690be8045) — selected: [{"after":[1,6]},{"after":[9,19]},{"after":[21,32]},{"after":[34,36]},{"after":[38,39]},{"after":[41,41]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[27,29]},{"after":[197,198]},{"after":[217,220]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[1,17]},{"after":[32,37]},{"after":[39,41]},{"after":[44,52]},{"after":[54,56]},{"after":[59,62]},{"after":[65,76]},{"after":[78,78]},{"after":[80,87]},{"after":[90,90]},{"after":[94,96]},{"after":[98,99]},{"after":[101,107]},{"after":[114,115]},{"after":[117,118]},{"after":[122,122]},{"after":[124,125]},{"after":[147,147]},{"after":[150,161]},{"after":[163,170]},{"after":[172,172]},{"after":[174,174]},{"after":[176,178]},{"after":[180,197]},{"after":[238,240]},{"after":[242,242]},{"after":[256,258]},{"after":[260,260]},{"after":[263,266]},{"after":[268,269]},{"after":[352,355]},{"after":[362,367]},{"after":[369,371]},{"after":[381,381]}]
- `src/daemon/threads/status-board.ts` (a120cfa7414773b3cf12e25269e9b8ac0b62b287) — selected: [{"after":[26,26]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[44,49]}]
- `src/shared/types.ts` (aeef8d881c29690e9fb152167246db81596fe6b0) — selected: [{"after":[1242,1242]},{"after":[1250,1250]}]
- `src/workflow/code-review/task-review/checkpoint.ts` (177b09b5d011cc7d8ee8aa97dfd79de696ee32d1) — selected: [{"after":[26,30]},{"after":[36,36]},{"after":[41,46]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[7,7]},{"after":[40,41]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[3,3]},{"after":[33,34]},{"after":[38,39]},{"after":[61,61]},{"after":[65,65]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[62,62]},{"after":[168,168]},{"after":[170,170]},{"after":[172,172]},{"after":[174,174]},{"after":[176,182]},{"after":[184,185]},{"after":[196,196]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[57,58]},{"after":[244,246]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[14,15]},{"after":[94,112]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[5,5]},{"after":[19,21]},{"after":[35,35]},{"after":[38,38]},{"after":[40,40]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[16,17]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[30,33]},{"after":[137,137]},{"after":[146,146]},{"after":[148,149]},{"after":[154,154]},{"after":[157,158]},{"after":[166,167]},{"after":[188,188]},{"after":[191,196]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[38,38]},{"after":[121,121]},{"after":[129,129]},{"after":[132,135]},{"after":[227,228]},{"after":[230,231]},{"after":[238,238]}]
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` (6bc57be2ba5c5c6516dc32dd50a0c5d71cb485fe) — selected: [{"after":[12,12]},{"after":[49,49]},{"after":[111,111]}]
- `src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` (4ff1c665d9b9eb017ba6b6bda7dee582ffd8a0e2) — selected: [{"after":[1,15]},{"after":[17,30]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[1,75]},{"after":[79,84]},{"after":[89,89]},{"after":[99,100]},{"after":[102,102]},{"after":[115,118]},{"after":[120,125]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[10,10]},{"after":[29,36]},{"after":[38,38]},{"after":[46,50]},{"after":[55,55]},{"after":[107,107]},{"after":[114,114]}]
- `src/workflow/code-review/task-review/controller.ts` (ac14aaa784ccca3453ca230583ad0889439efda5) — selected: [{"after":[57,57]}]
- `src/workflow/code-review/task-review/coordinator.ts` (f3bddfa6764e7e58f0f9b1f7de17d84597993414) — selected: [{"after":[37,37]},{"after":[69,69]},{"after":[136,136]},{"after":[147,147]},{"after":[150,150]},{"after":[184,184]}]
- `src/workflow/code-review/task-review/progress.ts` (487cc87ba0fc25662f66b97663666382611de1ea) — selected: [{"after":[25,25]},{"after":[29,33]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[1,19]},{"after":[22,28]},{"after":[34,38]},{"after":[42,54]},{"after":[63,78]}]
- `src/workflow/code-review/task-review/worker-checkpoint.ts` (4aa9b1d075c01474bbe7e69beecc8eaa42f2c22c) — selected: [{"after":[1,6]},{"after":[8,46]},{"after":[51,61]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[22,24]},{"after":[26,26]},{"after":[27,30]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[18,18]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[116,116]},{"after":[229,229]},{"after":[233,234]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[85,85]},{"after":[90,98]},{"after":[101,101]},{"after":[103,114]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[29,33]},{"after":[55,58]},{"after":[60,62]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[21,21]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[34,35]},{"after":[49,49]},{"after":[78,78]},{"after":[156,156]},{"after":[160,161]},{"after":[202,202]},{"deletionAt":18}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[109,109]}]
- `src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` (eda17a50675f038025efc7de7ebed675eb070318) — selected: [{"after":[1,8]},{"after":[10,13]},{"after":[20,35]}]
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` (fb547407559f54592c1223a0ad84cf5acb6d0b92) — selected: [{"after":[1,2]},{"after":[4,14]},{"after":[16,29]},{"after":[32,33]},{"after":[35,35]},{"after":[37,50]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[48,49]},{"after":[99,99]},{"after":[224,224]},{"after":[226,226]},{"after":[248,248]},{"after":[257,257]},{"after":[284,284]},{"after":[286,286]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[1,5]},{"after":[7,11]},{"after":[14,22]},{"after":[28,29]},{"after":[32,41]},{"after":[45,47]},{"after":[50,52]},{"after":[54,55]},{"after":[63,64]},{"after":[100,110]},{"after":[112,129]},{"after":[134,135]}]
- `src/workflow/review/design-review/worker-checkpoint.ts` (3ca9672ab3359ff987128bb2803506f30c56c921) — selected: [{"after":[1,5]},{"after":[7,19]},{"after":[23,30]},{"after":[35,36]},{"after":[39,41]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[11,11]},{"after":[42,47]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[37,37]},{"after":[138,140]},{"after":[143,145]},{"after":[150,151]},{"after":[153,153]},{"after":[162,162]},{"after":[164,165]},{"after":[171,171]},{"after":[173,173]},{"after":[186,186]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[18,18]},{"after":[64,64]},{"after":[130,131]},{"after":[216,219]},{"after":[221,225]},{"after":[235,237]},{"after":[241,241]},{"after":[259,259]}]
- `src/workflow/review/design-review/__tests__/action-admission.test.ts` (7f68642d753288690949c0af2063988e31b8aad5) — selected: [{"after":[1,41]}]
- `src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` (eda17a50675f038025efc7de7ebed675eb070318) — selected: [{"after":[9,9]},{"after":[14,19]}]
- `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` (22cec41c3292d63c0fa6b54d402f79f185f85b41) — selected: [{"after":[88,88]}]
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` (fb547407559f54592c1223a0ad84cf5acb6d0b92) — selected: [{"after":[3,3]},{"after":[15,15]},{"after":[30,31]},{"after":[34,34]},{"after":[36,36]},{"after":[51,110]}]
- `src/workflow/review/design-review/action-admission.ts` (ab6ad1ec6ce494d3fff4773b1a185d374593b169) — selected: [{"after":[1,15]},{"after":[17,22]},{"after":[24,44]}]
- `src/workflow/review/design-review/action-state.ts` (5b18865714599352759cb1de66bc1fbe3141d806) — selected: [{"after":[1,13]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[8,8]},{"after":[19,19]},{"after":[52,53]},{"after":[57,57]},{"after":[59,60]},{"after":[78,87]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[15,15]},{"after":[35,35]},{"after":[46,46]},{"after":[59,59]},{"after":[78,78]},{"after":[128,128]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[70,71]},{"after":[236,236]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[34,34]},{"after":[158,158]},{"after":[200,200]},{"after":[218,218]},{"deletionAt":6}]
- `src/workflow/review/design-review/recovery-state.ts` (c6c73c31a78f33f803e49683de5a373f4cab6e39) — selected: [{"after":[5,5]},{"after":[55,55]}]
- `src/workflow/review/design-review/request-signature.ts` (88db8da028054a4db14811be462597320df07dfa) — selected: [{"after":[1,6]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[12,13]},{"after":[23,25]},{"after":[30,30]},{"after":[42,44]},{"after":[48,49]},{"after":[53,53]},{"after":[65,67]},{"after":[74,99]},{"after":[111,111]},{"after":[130,131]},{"after":[133,133]}]
- `src/workflow/review/design-review/worker-checkpoint.ts` (3ca9672ab3359ff987128bb2803506f30c56c921) — selected: [{"after":[6,6]},{"after":[20,22]},{"after":[31,34]},{"after":[37,38]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[1,24]},{"after":[26,26]},{"after":[28,34]},{"after":[36,49]},{"after":[51,51]},{"after":[54,57]},{"after":[60,60]},{"after":[63,63]}]
- `src/daemon/threads/__tests__/helpers/review-crash-daemon.ts` (bbdf678ad54802ac19da69b456603bdc11476fae) — selected: [{"after":[1,13]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[1,22]},{"after":[25,82]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[1,2]},{"after":[5,8]},{"after":[199,227]},{"after":[231,231]},{"after":[233,255]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[129,135]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[214,220]}]
- `src/daemon/threads/review-resource-recovery.ts` (d91b01775a31f8d1b7c210089dd013f0ddff6ebd) — selected: [{"after":[1,20]},{"after":[24,26]},{"after":[28,29]},{"after":[31,43]},{"after":[45,46]},{"after":[48,70]},{"after":[72,72]},{"after":[74,77]},{"after":[79,89]},{"after":[91,92]},{"after":[94,95]}]
- `src/daemon/threads/review-resource-worker.ts` (6d142cc4e16267935989b0c312d5f58dd812e241) — selected: [{"after":[1,22]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[39,39]},{"after":[226,226]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[19,20]},{"after":[25,25]},{"after":[79,79]},{"after":[89,89]},{"after":[119,119]},{"after":[267,267]},{"after":[336,336]},{"after":[338,338]},{"after":[341,351]},{"after":[368,368]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[27,27]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[5,5]},{"after":[37,44]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[3,4]},{"after":[42,47]},{"after":[72,73]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[13,13]},{"after":[243,243]},{"after":[251,251]}]
- `src/workflow/review/resource-recovery.ts` (08381389a423f9bb2eb65be1c70e6ab719e7d4fa) — selected: [{"after":[1,24]},{"after":[26,27]},{"after":[29,64]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[23,24]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[228,230]},{"after":[232,232]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[32,32]},{"after":[52,52]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[159,159]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[50,50]},{"after":[52,53]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[83,110]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[61,62]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[230,231]},{"after":[234,234]},{"after":[242,242]}]
- `jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` (ca1e19e42e925efdbadb3a55eaf38f6042d4ad2e) — selected: [{"after":[1,30]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` (c47b8e0a3353032e9eca7d7882b8dc7918a675de) — selected: [{"after":[80,80]},{"after":[1892,1892]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt` (665a63907432bc5c3bfb72f86c6d5594583680e2) — selected: [{"after":[1,37]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt` (996fb1ecbb06845abebf2a162c69439f627fba8b) — selected: [{"after":[58,58]},{"after":[63,63]},{"after":[204,210]},{"after":[216,218]},{"after":[227,228]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt` (2112db8048a8c965f5a5e8195e315acb89063673) — selected: [{"after":[148,149]},{"after":[162,171]},{"after":[210,210]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt` (ee71c07947928fb2e3ef8a0e9b890d165364d027) — selected: [{"after":[1,21]}]
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt` (de0f52f7a1265eb43f8aa742d18ffd2bd1ef9807) — selected: [{"after":[1,25]}]
- `src/cli/panes/DaemonPane.tsx` (ca040df17f39ced9c5d1cc59be229a15204a1a01) — selected: [{"after":[12,12]},{"after":[116,116]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[58,59]},{"after":[61,62]}]
- `src/daemon/threads/__tests__/review-worker-progress.test.ts` (885709678b254c70cb79abc7bbf0ca51c0eea374) — selected: [{"after":[1,85]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[76,76]},{"after":[91,91]}]
- `src/daemon/threads/admin-status.ts` (db1badb68a2a7ddebd0c7a2572e9fcbe2faf6088) — selected: [{"after":[56,56]}]
- `src/daemon/threads/main-services.ts` (ce2d343e345cc636acbfe844a485c002d20124b3) — selected: [{"after":[17,17]},{"after":[175,175]}]
- `src/daemon/threads/review-progress.ts` (862c456aae7973aa63631810e07eed687666a154) — selected: [{"after":[1,29]},{"after":[31,38]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[30,30]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[2,3]},{"after":[38,38]},{"after":[80,83]},{"after":[88,90]},{"after":[152,152]},{"after":[163,163]},{"after":[234,235]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[21,24]},{"after":[53,53]},{"after":[173,173]},{"after":[175,175]},{"after":[179,179]},{"after":[198,201]},{"after":[248,256]},{"after":[261,262]}]
- `src/daemon/threads/status-board.ts` (a120cfa7414773b3cf12e25269e9b8ac0b62b287) — selected: [{"after":[14,14]},{"after":[23,24]},{"after":[177,177]},{"after":[195,195]},{"after":[210,210]},{"after":[230,230]}]
- `src/daemon/threads/worker-entry.ts` (27273dfe0a990724269155695bdacf9dc9ecdd1f) — selected: [{"after":[16,16]},{"after":[21,21]},{"after":[89,89]}]
- `src/shared/review-worker-progress.ts` (0f30b627868dbb3f1518891b2bd213c6fdc0fa5b) — selected: [{"after":[1,28]}]
- `src/shared/types.ts` (aeef8d881c29690e9fb152167246db81596fe6b0) — selected: [{"after":[1246,1246]}]
- `src/workflow/artifact-content.ts` (00b7b090dd74fa13f859aa433853bca0d8690912) — selected: [{"after":[1,1]},{"after":[60,60]},{"after":[239,239]},{"after":[244,244]}]
- `src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` (4ff1c665d9b9eb017ba6b6bda7dee582ffd8a0e2) — selected: [{"after":[16,16]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[31,31]},{"after":[132,132]}]
- `src/workflow/review/worker-progress-source.ts` (b7f6536e5ace298c76362ebc72d9508ef957c224) — selected: [{"after":[1,10]}]
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` (474effbf47015be1a30a4861648176b8f8249024) — selected: [{"after":[1251,1255]},{"after":[1822,1822]},{"after":[1896,1896]},{"after":[1985,1985]},{"after":[7588,7599]}]
- `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` (93feb2befceff0c8445622c5996e96264317bdd4) — selected: [{"after":[1,20]}]
- `vscode-plugin/src/chat/docs-review-client.ts` (1b6550cbc2b5bc770c592d001457cad3c84dbd5c) — selected: [{"after":[36,36]},{"after":[191,191]}]
- `vscode-plugin/src/chat/docs-review-panel.ts` (1070f1e78c4e316589858e50022b00a480c4284b) — selected: [{"after":[1,1]},{"after":[107,108]},{"after":[1419,1427]},{"after":[1536,1536]},{"after":[1585,1585]},{"after":[1615,1615]},{"after":[2270,2270]},{"after":[2276,2276]},{"after":[2389,2389]},{"after":[2431,2431]}]
- `vscode-plugin/src/chat/protocol.ts` (096dd23f72d4434be70bf7a6e41f396d86c69d6c) — selected: [{"after":[157,157]},{"after":[175,176]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[76,78]},{"after":[87,88]}]
- `src/daemon/threads/__tests__/artifact-write-authority.test.ts` (a8fecc016757f4f09c2db2d79b147d28d47a4345) — selected: [{"after":[1,31]}]
- `src/daemon/threads/__tests__/helpers/artifact-writer.ts` (10a15b38abf08f372cc1c85c5157a21c4212e5d2) — selected: [{"after":[1,14]}]
- `src/daemon/threads/__tests__/helpers/review-maintenance.ts` (acc725cdb4f2cb9f35604c0689c06684b8dcb2a8) — selected: [{"after":[1,9]}]
- `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` (92fe1e0f8054237c646afefea802f0f9cc7c060e) — selected: [{"after":[1,90]}]
- `src/daemon/threads/__tests__/review-worker-publication.test.ts` (c669607eba51f6f358b2297bb1e29dfa1a5d6432) — selected: [{"after":[1,37]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[9,13]},{"after":[15,15]},{"after":[176,198]}]
- `src/daemon/threads/artifact-write-authority.ts` (9f2f96a4aa1d91f2e1b8a43030edd279db8f2d57) — selected: [{"after":[1,49]}]
- `src/daemon/threads/main-services.ts` (ce2d343e345cc636acbfe844a485c002d20124b3) — selected: [{"after":[18,20]},{"after":[159,162]},{"after":[176,176]},{"after":[179,179]},{"after":[217,217]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (b8687e80dccf8d382e8aea6039453bb9b6bc8b85) — selected: [{"after":[1,23]},{"after":[38,42]},{"after":[56,56]},{"after":[58,64]},{"after":[66,76]}]
- `src/daemon/threads/review-progress.ts` (862c456aae7973aa63631810e07eed687666a154) — selected: [{"after":[30,30]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[19,20]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[36,36]},{"after":[40,44]},{"after":[66,76]},{"after":[79,79]},{"after":[84,87]},{"after":[105,116]},{"after":[118,128]},{"after":[131,136]},{"after":[155,155]},{"after":[169,169]},{"after":[227,233]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[26,31]},{"after":[63,63]},{"after":[77,77]},{"after":[88,88]},{"after":[91,93]},{"after":[100,100]},{"after":[110,113]},{"after":[123,123]},{"after":[126,127]},{"after":[148,148]},{"after":[162,162]},{"after":[171,171]},{"after":[203,216]},{"after":[220,220]},{"after":[232,232]},{"after":[243,243]},{"after":[270,294]},{"after":[301,323]},{"after":[325,335]},{"after":[340,340]},{"after":[372,380]}]
- `src/daemon/threads/worker-entry.ts` (27273dfe0a990724269155695bdacf9dc9ecdd1f) — selected: [{"after":[17,20]},{"after":[83,88]}]
- `src/daemon/threads/workers.ts` (87dfb69b71b139ade3ea5dc0a8c718124baa1954) — selected: [{"after":[86,86]},{"after":[88,92]}]
- `src/workflow/artifact-core/store.ts` (ce586c7452fb4caa21d5c135ac8154ee050dee08) — selected: [{"after":[15,15]},{"after":[258,258]}]
- `src/workflow/artifact-core/write-authority.ts` (015c6127477a7c3c75f688aa9a577d121cc683cd) — selected: [{"after":[1,10]}]
- `src/workflow/code-review/task-review/cleanup.ts` (534cc31c4201ee07464c7be9119b7334b8ab06b0) — selected: [{"after":[1,1]},{"after":[5,11]},{"after":[17,17]},{"after":[25,25]},{"after":[29,29]},{"after":[34,34]},{"after":[36,38]},{"after":[41,41]},{"after":[47,54]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[21,21]},{"after":[39,41]}]
- `src/workflow/review/cleanup-owner.ts` (24839b0ae47be63319881bafa8df3f49ebbeb318) — selected: [{"after":[1,11]}]
- `src/workflow/review/design-review/cleanup.ts` (b43d0375f863140d58003509d29181fdf708c65e) — selected: [{"after":[9,12]},{"after":[15,16]},{"after":[20,21]},{"after":[41,42]},{"after":[44,45]},{"after":[52,52]},{"after":[56,56]},{"after":[60,60]},{"after":[76,76]},{"after":[94,94]},{"after":[101,101]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[2,2]},{"after":[270,273]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[6,6]},{"after":[26,26]},{"after":[56,62]}]
- `src/daemon/__tests__/review-native-policy.test.ts` (ce1f44f69742f1568a25aa184729ee7141e415fc) — selected: [{"after":[1,57]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[1,2]},{"after":[7,9]},{"after":[11,12]},{"after":[14,15]},{"after":[22,23]},{"after":[25,30]},{"after":[32,41]},{"after":[47,49]},{"after":[51,51]},{"after":[53,53]},{"after":[56,61]},{"after":[64,64]},{"after":[68,74]},{"after":[83,85]},{"after":[105,107]}]
- `src/daemon/__tests__/task-review-plan-path.test.ts` (89eb061136daf94dc096e916435db9818311dc8f) — selected: [{"after":[4,4]},{"after":[9,9]},{"after":[16,16]},{"after":[25,28]},{"after":[30,42]},{"deletionAt":6}]
- `src/daemon/design-review-rpc.ts` (a26d9a8ea156ce2b2d1b1d685c8994ba80a3a060) — selected: [{"after":[1,2]},{"after":[4,8]},{"after":[10,10]},{"after":[14,14]}]
- `src/daemon/handler-runtime.ts` (6b7ffe45606a1713df4419a7a799473a0142fd6a) — selected: [{"after":[146,146]},{"after":[706,707]},{"after":[975,976]}]
- `src/daemon/index.ts` (30357d70d94c2d98a4c2739eb3435ff7747e8eaf) — selected: [{"after":[71,72]},{"after":[271,271]},{"after":[277,280]},{"after":[307,307]},{"after":[417,422]},{"after":[512,512]},{"after":[662,662]},{"after":[681,681]},{"deletionAt":283}]
- `src/daemon/review-native-policy.ts` (9704928a1eb2d013d94bf29c5075f2c6f94d0de9) — selected: [{"after":[1,23]},{"after":[25,80]},{"after":[82,91]},{"after":[93,94]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[1,54]},{"after":[56,60]},{"after":[63,76]},{"after":[78,107]},{"after":[115,115]},{"after":[117,118]},{"after":[120,193]}]
- `src/daemon/steps/design-review-step.ts` (a1a01bd95e60b3fcd1ae63d655ef1ce61cd5b182) — selected: [{"after":[3,4]},{"deletionAt":1}]
- `src/daemon/steps/task-review-step.ts` (49c1d070d5a70a9f5ca3c5fe5e67e4c88f2ac9e6) — selected: [{"after":[6,6]},{"after":[10,10]},{"after":[14,14]},{"after":[17,17]},{"after":[21,23]},{"deletionAt":0}]
- `src/daemon/task-review-rpc.ts` (91a21cf0a6bc598181221fcc54c7bcb2364b7fa3) — selected: [{"after":[2,4]},{"after":[6,12]},{"after":[14,17]},{"after":[19,19]},{"after":[25,35]},{"after":[39,45]},{"deletionAt":0}]
- `src/daemon/threads/__tests__/helpers/review-controller.ts` (ef6a7a6464783ed6c19d2f63c60a5a3c7aa3f439) — selected: [{"after":[1,2]},{"after":[4,12]},{"after":[28,30]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (b8687e80dccf8d382e8aea6039453bb9b6bc8b85) — selected: [{"after":[24,37]},{"after":[43,55]},{"after":[65,65]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[84,86]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[106,106]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[22,23]}]
- `src/daemon/threads/review-worker-resources.ts` (5e64127ff404b3f0d4a9fb7b03b2821690be8045) — selected: [{"after":[7,8]},{"after":[20,20]},{"after":[33,33]},{"after":[37,37]},{"after":[40,40]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[45,45]},{"after":[52,56]},{"after":[64,65]},{"after":[77,77]},{"after":[96,104]},{"after":[129,130]},{"after":[189,190]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[42,43]},{"after":[97,97]},{"after":[120,120]},{"after":[146,146]},{"after":[149,149]},{"after":[295,298]},{"after":[300,300]},{"after":[356,361]}]
- `src/daemon/tools/review-git-command.ts` (17cffae89c1a887b2d04cdfc406315224a5b9bdd) — selected: [{"after":[1,15]}]
- `src/daemon/tools/review-shell-process.ts` (4e13c4850ff6ada3f8d8fda7b451f1295e97d08d) — selected: [{"after":[5,6]},{"after":[15,15]}]
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` (7a386f453d4e91b9c5d91b51f5a218e6f175acf3) — selected: [{"after":[492,521]},{"after":[1515,1539]},{"after":[1826,1826]},{"after":[2014,2014]},{"after":[2032,2032]}]
- `src/mcp/__tests__/schema-registry.test.ts` (791625cdadbba6fb5efb1372013fce135631fd23) — selected: [{"after":[49,49]}]
- `src/mcp/code-review/schema.ts` (ee399952d8a9d5ce1e501315cd556d50d6d6ca8c) — selected: [{"after":[6,6]},{"after":[12,13]}]
- `src/mcp/design-review/schema.ts` (5fd855c8a5026c077bdeacb42a5b0f531c8170bd) — selected: [{"after":[4,4]},{"after":[11,11]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[24,25]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[18,21]}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[8,12]},{"after":[30,33]},{"after":[36,41]},{"after":[55,59]},{"after":[70,74]},{"after":[77,77]},{"after":[80,80]},{"after":[82,82]}]
- `src/workflow/code-review/task-review/__tests__/controller.test.ts` (08a34f45c4e08f57918c10d35f35e3b327981351) — selected: [{"after":[22,22]},{"after":[43,43]},{"after":[47,47]},{"after":[51,51]},{"after":[59,59]},{"after":[62,62]},{"after":[78,78]},{"after":[82,82]}]
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts` (fb01bb7a7c9c2c5a7766f2a2470096e872945a91) — selected: [{"after":[6,6]},{"after":[13,13]},{"after":[21,21]},{"after":[24,24]},{"after":[30,31]},{"after":[33,33]},{"after":[35,35]}]
- `src/workflow/code-review/task-review/__tests__/progress-client.test.ts` (ee512924291a42f77168db286e4936e07982fe45) — selected: [{"after":[10,11]},{"after":[20,20]},{"after":[25,25]},{"after":[30,30]}]
- `src/workflow/code-review/task-review/worker-checkpoint.ts` (4aa9b1d075c01474bbe7e69beecc8eaa42f2c22c) — selected: [{"after":[7,7]},{"after":[47,50]}]
- `src/workflow/review/design-review/cleanup.ts` (b43d0375f863140d58003509d29181fdf708c65e) — selected: [{"after":[82,82]},{"deletionAt":26}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[3,6]},{"after":[10,10]},{"after":[13,13]},{"after":[16,19]},{"after":[24,24]},{"after":[31,31]},{"after":[42,46]},{"after":[50,50]},{"after":[52,52]},{"after":[54,55]},{"after":[62,63]},{"after":[65,67]},{"after":[75,82]},{"after":[86,104]},{"after":[108,117]},{"after":[119,139]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[61,62]},{"after":[77,77]},{"after":[108,114]},{"after":[116,116]},{"after":[119,119]}]
- `src/daemon/threads/review-resource-recovery.ts` (d91b01775a31f8d1b7c210089dd013f0ddff6ebd) — selected: [{"after":[21,23]},{"after":[27,27]},{"after":[30,30]},{"after":[44,44]},{"after":[47,47]},{"after":[71,71]},{"after":[73,73]},{"after":[78,78]},{"after":[90,90]},{"after":[93,93]}]
- `src/daemon/threads/review-worker-admission.ts` (59ad0cb96457288da035536cfa2946acf681ac51) — selected: [{"after":[25,25]},{"deletionAt":26}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[175,175]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[108,108]},{"after":[299,299]},{"after":[324,324]},{"after":[337,337]},{"after":[339,339]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[98,98]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[20,20]},{"after":[59,59]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[20,21]},{"after":[140,165]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[141,141]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[4,4]},{"after":[82,82]},{"after":[85,88]},{"after":[112,112]}]
- `src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts` (b5a3f88bb67ef0f9065d850b6318a73356056471) — selected: [{"after":[30,35]},{"after":[45,45]},{"after":[47,47]},{"deletionAt":2}]
- `src/workflow/review/design-review/__tests__/correction-admission.test.ts` (e5ca4adfee8fe241f8d447785272b5dc0ae9941c) — selected: [{"after":[59,59]}]
- `src/workflow/review/design-review/__tests__/publication.test.ts` (308804a1e87a3365d7a690a0053c2e09f23a7e96) — selected: [{"after":[99,99]},{"after":[108,112]},{"after":[114,114]}]
- `src/workflow/review/design-review/action-admission.ts` (ab6ad1ec6ce494d3fff4773b1a185d374593b169) — selected: [{"after":[16,16]},{"after":[23,23]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[88,88]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[60,60]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[131,131]},{"after":[156,156]},{"after":[168,168]},{"after":[178,178]},{"after":[189,189]},{"after":[199,199]},{"after":[229,229]},{"deletionAt":184}]
- `src/daemon/threads/__tests__/review-native-host.test.ts` (2e74533027a5dc6975e09aa2b367aab60a01f46b) — selected: [{"after":[1,27]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[14,14]},{"after":[160,176]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[36,38]},{"after":[73,73]},{"after":[113,116]},{"after":[120,120]},{"after":[128,128]},{"after":[136,136]}]
- `src/workflow/review/resource-recovery.ts` (08381389a423f9bb2eb65be1c70e6ab719e7d4fa) — selected: [{"after":[25,25]},{"after":[28,28]}]
- `design/task-review-final-scope-qualification.json` (5d2fff4455fee9eb2c18188ed488031ee6da9118) — selected: [{"after":[350,350]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (c67dc20acb9b200b6036f4d318abce7f8e40c13f) — selected: [{"after":[118,118]}]
- `src/daemon/threads/__tests__/helpers/review-controller.ts` (ef6a7a6464783ed6c19d2f63c60a5a3c7aa3f439) — selected: [{"after":[3,3]},{"after":[13,27]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (b8687e80dccf8d382e8aea6039453bb9b6bc8b85) — selected: [{"after":[57,57]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[117,117]},{"after":[142,142]},{"after":[147,147]}]
- `src/daemon/threads/review-workers.ts` (53a6a5f9a9755b427e9ae53085727fac3c2cd7c4) — selected: [{"after":[128,128]},{"after":[136,145]}]
- `src/workflow/artifact-core/codecs.ts` (69e5943d38feb99c3b5e241ced04b1ac8a1cf06e) — selected: [{"after":[20,20]},{"after":[104,104]}]
- `src/workflow/code-review/task-review/__tests__/capacity.test.ts` (999eeea19ecd03b551f4ed9aa21eee04050973f4) — selected: [{"after":[52,52]},{"after":[66,66]},{"after":[93,93]},{"after":[109,109]},{"after":[113,113]}]
- `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` (3c360f79d3c5ce9ea534701e795c85c66a15e398) — selected: [{"after":[15,15]},{"after":[95,96]},{"after":[103,103]}]
- `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` (49c2bd33c0fee42a525681ebb34a7a248c81a043) — selected: [{"after":[30,30]}]
- `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` (4ee3f548418c004ea0d8a7745ba458d9eeeb4762) — selected: [{"after":[4,4]},{"after":[18,19]},{"after":[22,22]},{"after":[33,35]}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[34,35]},{"after":[49,53]},{"after":[60,69]},{"after":[81,81]},{"after":[87,87]}]
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` (467b47808d0f3f6a9ceb57c9f6b78b40ca380c86) — selected: [{"after":[236,236]}]
- `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` (653e1404be7ea1e991626ff18a30c5d6196f9f82) — selected: [{"after":[66,66]},{"after":[85,85]},{"after":[97,97]}]
- `src/workflow/code-review/task-review/__tests__/history.test.ts` (c1df1d8015c7406752ef12a0f6c166f3fbb9c751) — selected: [{"after":[61,61]}]
- `src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` (7b18f123654f7f86f9c840a9d8042ab061297fd5) — selected: [{"after":[1,43]}]
- `src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts` (4b73991bf059d99194eff18192bc57581da658e9) — selected: [{"after":[19,19]},{"after":[22,22]},{"after":[37,38]},{"after":[44,44]}]
- `src/workflow/code-review/task-review/__tests__/recovery.test.ts` (ef2eb5ea7eff8a851988175d219e56cb8d9aef0b) — selected: [{"after":[11,11]},{"after":[30,30]},{"after":[41,41]},{"after":[47,47]},{"after":[53,53]},{"after":[56,56]},{"after":[61,61]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[86,86]},{"after":[119,119]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[46,46]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[78,78]},{"after":[80,80]},{"after":[108,108]}]
- `src/workflow/code-review/task-review/capacity.ts` (693e61df0bf8f1ebee0fdaf972558b6e95613119) — selected: [{"after":[12,12]},{"after":[85,88]}]
- `src/workflow/code-review/task-review/cleanup.ts` (534cc31c4201ee07464c7be9119b7334b8ab06b0) — selected: [{"after":[33,33]},{"after":[44,44]}]
- `src/workflow/code-review/task-review/completion.ts` (9219d011cb4a4ca7ddec41f89537d416749ade49) — selected: [{"after":[3,3]},{"after":[12,12]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[118,119]},{"after":[152,152]}]
- `src/workflow/code-review/task-review/history.ts` (1883eee5e020e4ddb5c3c11d6bab44b1a676dfad) — selected: [{"after":[6,6]},{"after":[18,18]}]
- `src/workflow/code-review/task-review/publication.ts` (b7479ffb5c25569d2129c112be754657c4b6e01c) — selected: [{"after":[3,3]},{"after":[33,33]},{"after":[40,40]},{"after":[45,45]},{"after":[84,84]}]
- `src/workflow/code-review/task-review/record.ts` (472df7e308b5c325ab3c07b6cf34aabddd0d9a28) — selected: [{"after":[5,5]},{"after":[10,11]},{"after":[20,20]},{"after":[40,40]},{"after":[46,46]},{"after":[48,48]},{"after":[66,76]},{"after":[90,90]},{"after":[127,127]},{"after":[130,130]}]
- `src/workflow/code-review/task-review/summary.ts` (9970fa2fe85c46ae13070b18f0da49292b1c2654) — selected: [{"after":[7,13]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (64f717c17da43e31f65385859d1a3408029f6383) — selected: [{"after":[1,8]},{"after":[10,13]},{"after":[15,19]},{"after":[21,23]},{"after":[28,29]},{"after":[31,33]}]
- `src/daemon/threads/__tests__/helpers/review-production-fixture.ts` (e118f2b99c90b8774a7df0dfbe7a5826988b69b4) — selected: [{"after":[1,39]},{"after":[41,43]},{"after":[45,59]}]
- `src/daemon/threads/__tests__/helpers/review-production-native.ts` (19d3eda8c7df6e941c8d14088ff9b180879dc71a) — selected: [{"after":[1,1]},{"after":[3,10]},{"after":[13,23]},{"after":[31,31]},{"after":[32,47]},{"after":[54,55]}]
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts` (cebcf075404d758051b35f03a44818ed5147e246) — selected: [{"after":[1,2]},{"after":[4,83]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[4,4]},{"after":[16,47]},{"after":[49,54]},{"after":[59,62]},{"after":[79,100]},{"after":[104,130]},{"after":[132,140]},{"after":[142,158]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (574e85f31b799a10e0a746175c71a7f16dfe8b00) — selected: [{"after":[82,85]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[27,27]},{"after":[35,35]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (64f717c17da43e31f65385859d1a3408029f6383) — selected: [{"after":[30,30]}]
- `src/daemon/threads/__tests__/helpers/review-production-fixture.ts` (e118f2b99c90b8774a7df0dfbe7a5826988b69b4) — selected: [{"after":[40,40]},{"after":[44,44]}]
- `src/daemon/threads/__tests__/helpers/review-production-native.ts` (19d3eda8c7df6e941c8d14088ff9b180879dc71a) — selected: [{"after":[2,2]},{"after":[11,12]},{"after":[24,30]},{"after":[48,53]},{"deletionAt":31}]
- `src/daemon/threads/__tests__/review-worker-daemon.test.ts` (1c0e84c813dde05a5c98411d2661b40277e5649c) — selected: [{"after":[1,140]}]
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts` (cebcf075404d758051b35f03a44818ed5147e246) — selected: [{"after":[3,3]},{"after":[84,115]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[3,3]},{"after":[48,48]},{"after":[55,58]},{"after":[63,78]},{"after":[101,103]},{"after":[131,131]},{"after":[141,141]}]
- `src/daemon/threads/review-worker-runtime.ts` (e108d00fbf6af17d8ba52e6e25e7069cd28c7462) — selected: [{"after":[183,183]}]
- `src/workflow/review/design-review/worker-admission.ts` (c20c8f0229d9762fbe8819ad7f42aebb5c2581d2) — selected: [{"after":[27,27]},{"after":[68,73]}]
- `docs/daemon.md` (deb2ef611d4ddb5f2b986f3c74dab122c9d1c741) — selected: [{"after":[1945,2012]}]
- `docs/workflow.md` (42d8fba864ebd58d5a4cc7f0de34ff835b8a296b) — selected: [{"after":[20,37]}]
- `src/daemon/review-native-policy.ts` (9704928a1eb2d013d94bf29c5075f2c6f94d0de9) — selected: [{"after":[24,24]},{"after":[81,81]},{"after":[92,92]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[55,55]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[25,25]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (64f717c17da43e31f65385859d1a3408029f6383) — selected: [{"after":[9,9]},{"after":[14,14]},{"after":[20,20]},{"after":[24,27]}]
- `src/daemon/threads/__tests__/helpers/review-worker-rpc.ts` (e3e8e457a8c3c12225a3441a9b17cb388cbef632) — selected: [{"after":[1,9]}]
- `src/daemon/threads/__tests__/review-worker-package.test.ts` (1e0a6bbb892ce45ed2d2da2f281fd25ee525846c) — selected: [{"after":[1,75]}]
- `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` (1cec33e92bd35f647ba5148670c20d26f8b19be3) — selected: [{"after":[4,4]},{"after":[7,9]},{"after":[22,22]},{"after":[29,29]},{"after":[38,39]},{"deletionAt":67}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[4,4]},{"after":[75,76]}]
- Task t1: reassess; changes 0, 1, 2, 3, 4, 5, 109, 309, 314; identity 6ca1bb9fcabde151a8a2a587009fb5fd7999086e8c20fdea7252300286ee4cd9
- Task t2: reassess; changes 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 110, 150, 151, 152, 170, 171, 179, 283, 284; identity 9fa310ba21e594c60d84c75efaab07cb16f41e5b4f1c06fcef501fc7a74c7084
- Task t3: reassess; changes 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 278, 296, 303, 304, 305, 309, 310, 311, 313, 314, 315, 316, 317, 318; identity cf5bd624b9aa9916c95f53bdb2ba6287d8a8fba3eefdd9c97d5668a01e929dae
- Task t4: reassess; changes 47, 48, 49, 50, 53, 54, 64, 75, 163, 168, 249, 288; identity d13cd4928da3a4c096394977d7dba6901ce6409866f4ea2f8d5cfa5d92b8e7dd
- Task t5: reassess; changes 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 83, 98, 107, 260, 336; identity a39d9e216aa148b8155a4b1e9354dd87a454d9789ce36405216c3095ce494ff1
- Task t6: reassess; changes 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 254, 255; identity 2fa48534ecf10c4928e09652b1bd4f3aae878b4c582837a691a97a22d37e7b26
- Task t7: reassess; changes 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 101, 102, 104, 112, 134; identity 24ffcdd11ca50ef3c63a99e56e43822407c4b49849ba7153afae1fb1c3d0520a
- Task t8: reassess; changes 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 128, 129, 130, 133, 135, 141, 142, 143, 248, 251, 253, 286, 288, 295, 324; identity 2a6f596ef2780e22279ab086dc57f73b33d8a07a60775c83b5ec5be602ff5ca7
- Task t9: reassess; changes 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 175, 176, 203, 211, 230, 262, 263, 264, 265, 266, 271, 272, 274, 275, 297, 299, 300, 301, 302, 306, 307, 308, 309, 310, 311, 342, 343; identity 70ffd5dddc16256854964d27a4eae0c7a870b3e471f9980b06349d32291a0c5d
- Task t10: reassess; changes 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 179, 180, 204, 234, 277, 278, 279, 280, 281, 282, 283, 284, 285, 332, 333; identity af0d567394aae728aafc17635dea04f0d5370646dbc2a173e50fcfe85c09d18e
- Task t11: reassess; changes 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 270, 289, 325, 338; identity 10e308100377b598624c5adf0ed1baaf1503e704d71015c3949b912312d36057
- Task t12: reassess; changes 40, 41, 43, 44, 45, 106, 108, 125, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 221, 265, 306; identity fa4155de4223463a70c731e670957b16f8b74b15aa5cfac6244bce473f5e66ee
- Task t13: reassess; changes 24, 25, 28, 31, 33, 34, 37, 46, 162, 167, 172, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 247, 267, 287, 288, 289, 292, 293, 294, 295, 298, 305, 307, 312, 313, 315, 316, 317, 318, 333; identity 06387cd607dc41623894d15158e650dea973e84cf833ef96348408b043a27b94
- Task t14: reassess; changes 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 286, 288, 290, 291, 295, 336, 337; identity 038c844b068c7c0a89ac6194fb38b5e304eed69c49209c0c6e6c52e6a14e78af
- Task t15: reassess; changes 47, 51, 58, 66, 74, 85, 94, 99, 111, 114, 158, 159, 160, 161, 173, 174, 177, 178, 215, 216, 217, 246, 286, 287, 291, 292, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 338, 339; identity 59f981bd206ca1a80e08ac98360122e7422a27bd12e28fb1fd2c11ca5d6a961a
- Task t16: reassess; changes 63, 79, 83, 260, 290, 319, 320, 321, 326, 327, 328, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343; identity b66293976c6b7c322ef0e812a10724a20a6a1a8160a0c10c632e685fe8bd849c

Attributed all 344 changes and all 115 required tests against the pinned PLAN/LLD and attempt-2 submission. All tasks require reassessment: attempt 1 accepted no scope because the native CLI input exceeded its character limit. Cross-cutting evidence is shared by behavior; unchanged regressions and other-Story tests establish compatibility without expanding finding scope. All supplied requiredWitnessChangeIndexes are empty, so no additional witness changes are required. Reported failed client checks remain unresolved evidence. No code findings are produced.

### t1: passed

Reviewed every submitted t1 changed segment against the pinned LLD, PLAN and all four acceptance checks. No material implementation or coverage defects found. Admission discrimination, immutable input, historical compatibility, bounded resource contracts and serialized checkpoint updates satisfy the scoped requirements.

Coverage: **verified** — Inspected test bodies and assertions for all nine submitted test files. Coverage demonstrates admission round-trips, rejection of invented results and approval bindings, immutable packet snapshots, unknown-version refusal, failed/interrupted attempt semantics, resource bounds and foreign-receipt rejection. Regression assertions retain source-pin, completion and historical-reader checks. Additional inspected writer-race assertions demonstrate that admission replay preserves a preceding resource update. This verifies coverage assessment, not test execution.


Optional verification and advice (nonblocking):

- Optional execution: Tests, integration checks, typechecks and builds were not run. Builder-reported passes were treated as reported evidence, not independently verified execution of the reviewed pin.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/review-resources.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/contracts.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/compatibility.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/transition.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/publication-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`

### t2: passed

Completed review of all submitted t2 segments against the pinned LLD, PLAN and four acceptance checks. No material defects found.

Coverage: **verified** — Inspected test bodies and assertions covering immutable admission inputs/actions, rejection of premature results and unsupported formats, historical checkpoint compatibility, serialized legacy/resource/progress writes, unresolved-lease preservation, recovery qualification and sealed outcomes. Additional tests exercise worker recovery, impact corrections, artifact invalidation, admission approval refusal and preservation of published approval evidence. Coverage assessment is complete; builder-reported executions were not treated as reviewer executions or independent proof of the pinned behavior.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review. Supplied passing results remain builder-reported; revision equivalence was not independently established.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/contracts.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/action-state.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/approval.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/review-resources.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/fixtures.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/impact-contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/action-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/approval.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/subject-monitor.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/correction-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-clearance.test.ts`

### t3: changes_requested

Completed inspection of all submitted segments, relevant requirements, acceptance checks and test assertions. Two MED defects affect admission recovery and unsupported-version preservation.

Coverage: **verified** — Reviewed relevant test bodies and assertions against all five acceptance checks. Both families assert technical-failure retention, permanent reads, approval exclusion, receipt replay and operational-guard normalization. Compatibility suites cover completion, diagnostic provenance, reuse, publication faults, history validation and readers. Input/source/result mutation assertions substantiate preservation behavior. Coverage review identified two missing behavioral cases described in findings: qualification after pass→admission failure, and unsupported-version refusal during technical publication. Test execution was not required to complete this assessment.

- **MED** `src/workflow/code-review/task-review/capacity.ts:85-88`: Capacity qualification blocks recovery after a published pass followed by a technical admission failure.
  For pass attempt 1 → published admission failure 2 → new attempt 3, this reconstruction retains admissionFailures but sets status from qualified reviews alone, producing passed. mergeTaskSummary subsequently validates that reconstructed baseline and rejects it because the unresolved admission requires failed status. The new attempt therefore fails qualification before it can supersede the admission failure. Preserve admission-aware status when constructing the capacity baseline. The admission-history test manually installs the successful successor and bypasses this qualification path; capacity tests do not cover this sequence.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/capacity.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/record.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-checkpoint.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/capacity.test.ts`
- **MED** `src/workflow/code-review/task-review/publication.ts:126-131`: Technical admission publication can overwrite an unsupported permanent CR version.
  Unlike normal publication, this branch never checks the existing head's schemaVersion. An existing schemaVersion 99 head with an otherwise readable task-based body is accepted, augmented and rewritten. ArtifactStore applies the CR codec's contentMeta, replacing its version with 3. Neither the shared decoder nor store supplies the missing version guard. This silently downgrades unsupported history instead of preserving its bytes. The existing unknown-version publication regression exercises only qualified publication; add the terminal-admission variant.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/publication.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/codecs.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/store.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/decode.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/publication.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run. Supplied passing results are builder-reported for 35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5; they were not independently reproduced or treated as executions of the reviewed pin.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/capacity.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/completion.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/contracts.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/history.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/progress-view.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/publication.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/record.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/summary.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/capacity.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/approval.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/contracts.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/history.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/provenance.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/publication.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/read.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/results.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/approval.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/history-aggregate.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/persistence-fence.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/provenance.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/readers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/report-log.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/resource-audit.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/codecs.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/store.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/decode.ts`
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/checkpoint.ts`
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/coordinator.ts`

### t4: passed

Completed inspection of all submitted selected segments against LLD r5, PLAN r6 task t4 and all five acceptance checks. No blocking defects found.

Coverage: **verified** — Reviewed test bodies, assertions and relevant fixtures. Coverage demonstrates reservation before spawn, identical/conflicting replay, durable-intent enforcement, cancellation across reservation/validation/spawn, bounded output and blocked-consumer cancellation, confirmed versus unknown disposal, targeted fencing and replacement exclusion. Adapter and recovery assertions cover real worker loss, permission-denied zero-spawn behavior, shutdown ordering and explicit clearance. Native-broker assertions preserve its daemon-only boundary. Builder-reported executions were not treated as reviewer executions or fresh proof of the pinned version.


Optional verification and advice (nonblocking):

- Optional execution: Tests, integration checks, typechecks and builds were not run during this review.
- Design companion diagram sources were inspected; browser rendering was not verified.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-processes.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-native-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/shell-helper.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/process-group.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-process-bridge.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-native-policy.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-processes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-native-host.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/review-worker-process.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/process-broker-native.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-native-policy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/cli-subprocess.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t5: changes_requested

Completed inspection of all submitted t5 segments, relevant design requirements, all four acceptance checks, and test assertions. Found one provider compatibility regression affecting Vibe reviews.

Coverage: **verified** — Reviewed test bodies and assertions against every t5 acceptance check. Tests assert durable-intent ordering, host leases, real-worker parsing and termination cleanup, cancellation and late-output suppression, spawn/observer/save failures, asynchronous binary lookup, and unbound-worker refusal. Host, inventory, and bootstrap tests cover ownership guards, bounded frames, outstanding-consumer cancellation, immutable worker role, and async-context retention. Provider compatibility tests assert non-review arguments, retries, deadlines, effort, schemas and read-only grants. Vibe compatibility coverage misses production authorization on the bound transport, as reported in the finding. Builder-reported passes were not treated as executions of the pinned revision.

- **MED** `src/shared/vibe-session.ts:99-104`: The new managed transport prevents configured Vibe reviewers from starting under production authorization.
  When a review transport is bound, startTransport uses launchReviewShell, which reserves the Vibe app server as kind 'tool'. Production authorizeReviewNative permits only Git executables for that kind, so it rejects the Vibe command before initialization. The review role can still resolve to a Vibe CliProvider, violating the acceptance requirement to preserve supported provider selection. Preserve host ownership while supplying an authorized Vibe session path. Add a bound-worker regression using production authorization: the submitted CLI fixtures cover only Claude/Codex, while existing Vibe tests use no bridge or a permissive fixture host.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/vibe-session.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/review-shell-process.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-native-policy.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/analyze/context/role-router.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/analyze/context/shaper-provider.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/cli-vibe.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/review-worker-process.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run. Supplied execution results remain builder-reported.
- Optional execution: Inspected the sequence and component companion sources; browser rendering was not verified.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/cli-provider.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/review-worker-process.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-processes.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/process-group.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-process-bridge.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/vibe-session.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native-guard.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-native-policy.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/review-shell-process.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-native-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/analyze/context/role-router.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/analyze/context/shaper-provider.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/cli-review-session.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/cli-vibe.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/vibe-session.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-processes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-spawn-inventory.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-native-host.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-native-policy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/process-broker-native.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t6: passed

Inspected every submitted t6 changed module at the pinned revision against the relevant LLD, PLAN and all four acceptance checks. No material in-scope defects found. Host ownership, worker-side parsing, permission/provenance checks and public result compatibility are preserved.

Coverage: **verified** — Reviewed test bodies and fixture implementations. Assertions cover durable intent before launch, Git admission, exact binary output, UTF-8 and exit/error results, truncation, approval/provenance refusal before reservation, effective cancellation, native-spawn refusal, asynchronous binary lookup, backpressure and paused-output timeout, worker loss, unknown-disposal fencing and continued operation of unrelated reviews. This verifies coverage by inspection, not execution.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run. Builder-reported passes at earlier revisions were not treated as executions of the pinned implementation.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-spawn-inventory.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-processes.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/review-shell-process.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/shell-helper.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native-guard.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-process-bridge.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/vibe-session.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/review-git-command.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-processes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-native-host.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-native-policy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/git-isolation.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/tool-signal.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-native-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-native-policy.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/process-group.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/cli-provider.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/review-worker-process.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/helpers/review-process-worker.mjs`

### t7: passed

Completed review of every submitted t7 segment against the pinned design, plan and all six acceptance checks. No blocking implementation defect found. One nonblocking test assertion weakness remains.

Coverage: **verified** — Inspected test bodies, assertions and supporting fixtures. Source/compiled startup tests exercise both coordinator families, inherited tool settings, store ownership, durable v2 unverified admission, immutable role, CLI execution, byte-tool transport and missing-binding refusal. Timeout tests assert the configured 30-second deadline, bounded rejection for never-ready and pre-save hangs, late-message rejection, nonreusable fencing and eventual lock/store reclamation. Registry/isolation tests cover canonical aliases, conflicting input, stale identities and progress, independent workers, targeted disconnect and continued unrelated work. Package tests exercise compiled entrypoints without source or a TypeScript loader. Static inspection confirms the timer precedes creation and completion requires both readiness and the matching durable receipt, with no fallback branch. The async-context test's ineffective assertion is reported separately. Builder-reported runs at earlier revisions were not treated as execution evidence for the pinned implementation.

- **LOW** `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts:125`: The async-context regression test can pass when its context assertion fails.
  ReviewWorkerNativeTransport catches consumer exceptions and sends outputAck with error='review_output_rejected'. This fixture ignores that error, resolves acknowledged and returns code 0. Consequently, the assertion inside the consumer at line 129 does not reliably fail the test. Capture the observed context and assert it after start resolves, or propagate the rejected acknowledgment into the test result.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-native.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, typechecks or builds were run during this review. Supplied passing results remain builder-reported and revision-specific.
- Optional execution: Design companion source was inspected; browser rendering was not performed.
- Naming follows local TypeScript examples: startWorker/startDaemonWorker/pushToWorker, ThreadServices/StatusBoardClient, and kebab-case module filenames. Public method and serialized identity names remain compatible.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-bootstrap.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-contract.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native-guard.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-process-bridge.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/worker-entry.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/main-services.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/channel.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-package.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-daemon.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t8: changes_requested

Completed inspection of all submitted changed modules, pinned requirements/design, all six acceptance checks, and relevant test assertions. Found two MED registry lifecycle/ownership defects.

Coverage: **verified** — Coverage review is complete through pinned test bodies/assertions and relevant fixture implementations. The six acceptance checks were assessed against real-worker identity/concurrency tests, trusted family dispatch and stale-envelope assertions, targeted disconnect/reclamation tests, shared subject/cleanup consumers, daemon-observer lifetime checks, and CLI/shell lease-policy and durable-intent assertions. Replay serialization, native-port loss, crash recovery, and permanent-history cleanup are also covered. The two findings identify uncovered transitions: foreign next-attempt admission and terminal subject release. Builder-reported passes were not treated as reviewer executions or proof of those missing behaviors.

- **MED** `src/daemon/threads/review-workers.ts:129-129`: Check controller ownership before advancing an existing review to another attempt.
  The next-attempt branch forwards review.worker.advance and closes the previous worker before reaching assertController. Once the previous controller attempt is terminal and eligible to advance, another live connection can submit attempt N+1, retire that owner's worker, and acquire the replacement. The private call uses the previous owner's trusted context, so the worker cannot detect the foreign initiator. This bypasses the required owner check before forwarding. Existing wrong-owner assertions cover progress/result exchanges, but not next-attempt admission.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- **MED** `src/daemon/threads/review-workers.ts:147-147`: Reclaim terminal workers before retaining their design-subject exclusion indefinitely.
  The subject exclusion considers every registry entry, including completed or failed reviews. Terminal progress only updates the cache/status board; neither it nor the worker runtime initiates normal terminal reclamation. Consequently, a completed daemon design review continues blocking a fresh review ID for the same artifact until cleanup, explicit replacement, or daemon shutdown. It also retains the worker's live ports/thread. The LLD requires terminal drain and reclamation, and the family coordinator releases its own subject lease after execution. Tests assert active-subject exclusion but do not attempt a fresh same-subject review after completion.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/supervisor.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks, or builds were run by this reviewer. Supplied results at earlier build-gate commits and 35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5 remain builder-reported evidence.
- Optional execution: Diagram companion sources were inspected; browser rendering was not performed.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-native-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-bootstrap.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-contract.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/status-board.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/types.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-processes.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-request-owner.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/supervisor.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/worker-requests.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-native-host.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-processes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/review-worker-process.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t9: passed

Inspected every submitted changed segment and deletion anchor against the pinned LLD, PLAN t9, all six acceptance checks, and relevant test assertions. No material in-scope defect found. Coordinator reuse, checkpoint ownership, recovery fencing, naming, and wire compatibility remain consistent with the design.

Coverage: **verified** — Coverage inspection is complete. Worker assertions cover acknowledgment before blocked source qualification, qualified persistence before provider dispatch, identical/conflicting replay, persisted admission failures, immutable attempts, controller assignment identity, stale-execution rejection, explicit recovery, and lease retention during feedback saves. Registry tests cover main-owned identity, controller authority, cleanup reservations, and serialized intent replay. Regression bodies cover attribution, dependency ordering, committed selected blocks, final revision pins, unchanged projection ceilings, capacity, activity, and recovery semantics. Builder-reported execution was not treated as independent execution of the pinned revision.


Optional verification and advice (nonblocking):

- Optional execution: Tests, integration checks, typechecks, and builds were not independently run; supplied passing results remain builder-reported.
- Optional execution: Diagram rendering was not performed. Inspected the pinned companion HTML/Mermaid sources and descriptions for consistency with the LLD.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/controller.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/capacity.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-contract.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-bootstrap.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/capacity.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/compatibility.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller-activity.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/coordinator.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/activity-execution.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/attribution-binding.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/attribution-scope.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/derived-unit.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/documents-contract.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/effective-scope.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/historical-regression.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/policy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/projection-intervals.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/projection-lineage.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/projection.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/qualification.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/review-scope-policy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/route-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/route-documents.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/selected-code.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/transition.test.ts`

### t10: changes_requested

Completed inspection of all submitted changed segments, the pinned requirements/design and relevant test assertions. Found three recovery defects affecting cold publication retries, rejected restarts and reviewer changes.

Coverage: **verified** — Completed the coverage review against all six acceptance checks using test bodies and assertions. Worker barriers establish durable admission before qualification/provider dispatch; route fixtures assert Epic, standalone and ISSUE ancestry and independent reviewer selection. Controller and worker tests assert successful exchanges, subject exclusion, retained feedback, stale-generation rejection, impact selection and fresh final consistency. Retry, capacity, consolidation, checkpoint and subject-monitor suites assert bounded dispatch, persistence failure fencing, immutable history, resource-intent preservation and target-only invalidation. Publication/history suites assert model-free replay and retained approval evidence. These positive assertions do not cover the three failing transitions identified in findings: cold public publication recovery, rejected restart followed by valid resume, or reviewer-changing restart through the worker registry. Verified describes completion of this inspection, not test execution.

- **MED** `src/daemon/threads/review-worker-admission.ts:42-46`: Cold publication retries still create an unverified execution-recovery action.
  After worker exit, the public design recover route boots a regular worker and reaches this unconditional admitDesignRecovery call for retry_publication. DesignReviewWorker.recover then takes its publication-only branch without settling that action. This changes the preservation digest of already accepted feedback, so lost-receipt publication cannot locate its original history entry and fails the unchanged-subject check. The lingering unverified action also blocks subsequent new recovery actions. The publication tests exercise cold registry.publishStored maintenance workers and live public retries, leaving this cold public route uncovered.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-admission.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/history.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/publication.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-publication.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- **MED** `src/workflow/review/design-review/worker-admission.ts:74-75`: A rejected full restart permanently advances the live attempt identity.
  resultAttempt is calculated before qualification, and both targetAttempt and the main registry advance immediately. For example, restart_full on an inactive paused or interrupted qualified attempt is durably admitted, then rejected because the source is not invalidated. No next attempt is created, but neither runtime identity is restored. A subsequent valid resume runs the original attempt while progress requests target the nonexistent next attempt and controller exchanges for the actual attempt are rejected. Advance execution identity only when the next attempt exists, while retaining separate admission-action progress. Existing tests cover rejected resume followed by successful restart, but not rejected restart followed by valid resume.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/action-admission.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- **MED** `src/workflow/review/design-review/worker-admission.ts:33-35`: Approved restart cannot refresh the reviewer after artifact authorship changes.
  The prepare wrapper permanently binds the reviewer to the worker's initial reviewer. If an artifact's author changes during review, subject monitoring invalidates the attempt, but an explicit restart prepares the new independent reviewer and fails this equality check. The live public recover route reuses that worker and its original scope, so normal recovery cannot complete without externally retiring the worker. Preserve the guard by re-resolving main-owned reviewer authority and replacing the worker when necessary. The existing coordinator recovery test explicitly verifies reviewer refresh after an author change; the worker integration test never changes authorship and therefore misses this regression.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review. The supplied 391-pass result at 35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5 is builder-reported; it was not treated as a reviewer execution of the pinned 262ef49221223eb568662db6d86b1cb8a07091a3 implementation.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/design-review-rpc.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/action-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/action-state.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/contracts.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/recovery-state.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/request-signature.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/history.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/publication.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/fixtures.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/action-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/activity-monitor.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/assignment-schema.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/capacity.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/controller.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/coordinator.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/correction-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/impact-consolidation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/impact-contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/impact-execution.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/impact-qualification.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/impact-selection.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/policy-results.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/retry.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/selected-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/subject-monitor.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/subject.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-worker-routing.test.ts`

### t11: passed

Completed review of all submitted t11 segments against the pinned LLD, PLAN and seven acceptance checks. No material in-scope defects found.

Coverage: **verified** — Inspected test bodies and assertions, not just reported results. Coverage demonstrates targeted previous-daemon and legacy fences, exact broker approval binding, denial/expiry/disconnect/stale-state refusal, bounded durable receipts, metadata-only clearance, disposable and full-daemon crash recovery, partial clearance and audit replay, separate explicit recovery, and immutable failed attempts. Lost pending broker requests were also assessed against the broker’s memory-only ownership and the absence of checkpoint mutation before an accepted answer. Production route bindings were inspected as context. Builder-reported passes were not treated as reviewer executions at the pinned version.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review.
- Optional execution: Diagram companion sources were inspected; browser rendering was not performed.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-crash-daemon.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-native-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-processes.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-resource-recovery.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-resource-worker.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/process-group.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/resource-recovery.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/resource-audit.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/approval-broker.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/task-review-rpc.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/design-review-rpc.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/review-resources.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-processes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-native-host.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/action-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/process-broker-native.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/approval-broker.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/approval-ipc.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t12: passed

Reviewed all submitted t12 segments against the pinned LLD, PLAN and five acceptance checks. No material defects found in cached admission progress, ownership preservation, artifact delivery or supported client compatibility.

Coverage: **verified** — Inspected relevant test bodies and assertions. Real-worker fixtures cover responsive cached observation during blocked code/design admission, explicit unverified zero inventory, technical failure without provider dispatch, status-board isolation and artifact delivery. Controller tests cover owner rejection, replay and execution identity preservation. VS Code and Kotlin tests cover admission/failure/completed labels and DTO compatibility; existing progress, history, artifact-content, frame and presenter assertions cover qualified-view compatibility. All five acceptance checks were assessed. This is a coverage assessment, not a claim of reviewer-executed tests.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks, builds or live IDE checks were executed. Supplied runs are builder-reported at their stated versions and were not treated as fresh execution of the reviewed pin.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/progress-view.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/contracts.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/worker-progress-source.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-content.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/types.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-worker-progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/cli/panes/DaemonPane.tsx`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/status-board.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/admin-status.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/main-services.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/worker-entry.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-contract.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-worker-routing.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-execution.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-persistence.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/activity-monitor.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/coverage-progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/readers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/docs-review-client.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/docs-review-panel.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/protocol.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/docs-review-client.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/review-frame-message.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/review-presenter.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentTest.kt`

### t13: changes_requested

Completed review of all submitted changed segments, pinned requirements/design and relevant test assertions. Two maintenance routes bypass CR format-version checks.

Coverage: **verified** — Completed assertion-level coverage review for all six acceptance checks. Recovery tests assert retained task/chunk feedback, dispatch counters and stale-owner refusal. Worker publication tests assert zero provider calls and unchanged permanent-publication counts after replacement/lost receipts. Cleanup tests exercise actual approval consumers, unknown admission scopes, concurrent publication, evidence-preserved deletion and permanent reads for both families. Resource tests assert exact broker receipts, partial/stale clearance, historical fences and retained audits. Shutdown tests assert durable lease closure before worker exit and replacement. All submitted changed test/helper bodies were inspected. Missing maintenance-route version assertions are documented in the findings. Builder-reported passes were not treated as reviewer executions or proof of pinned behavior.

- **MED** `src/workflow/code-review/task-review/publication.ts:126-131`: Reject unsupported CR versions before publishing technical admission failures.
  Unlike qualified publication, this branch never checks the existing head's schemaVersion. A CR with schemaVersion 99 and a currently valid body is decoded successfully, merged and rewritten as version 3 by the codec. This silently overwrites unsupported permanent evidence. The existing unknown-version publication test exercises only qualified publication; add equivalent admission-failure coverage asserting rejection and unchanged bytes.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/publication.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/codecs.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/decode.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/store.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/publication.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`
- **MED** `src/daemon/threads/review-cleanup-discovery.ts:45`: Apply permanent CR capability checks to post-cleanup progress reads.
  This reader validates only body shape, ignoring meta.schemaVersion and its correspondence with preserved failures. After checkpoint cleanup, an unsupported version such as 99 can therefore produce passed/complete progress, although readTaskReviewHistory rejects the same record. Reuse equivalent version/capability validation and cover unsupported and mismatched versions through storedProgress after cleanup; current worker-cleanup assertions cover supported records only.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-cleanup-discovery.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/history.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run; conclusions are based on pinned source and assertion inspection.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/publication.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/record.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/summary.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/history.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/completion.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/cleanup.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/approval.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/history.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/publication.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/read.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/cleanup.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/coordinator.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/resource-audit.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/resource-recovery.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/cleanup-owner.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/store.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/write-authority.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/codecs.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/artifact-core/decode.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/task-review-rpc.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-native-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/artifact-write-authority.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/main-services.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-cleanup-discovery.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-progress.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-contract.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/worker-entry.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/artifact-writer.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-maintenance.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-controller.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/cleanup.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/cleanup.test.ts`

### t14: changes_requested

Completed review of all submitted changed segments, pinned requirements/design, acceptance checks and relevant test assertions. Found one MED defect in production cleanup of no-document code reviews.

Coverage: **verified** — Completed the relevant coverage assessment by inspecting bodies and assertions for production RPC/MCP routing, both families, disabled session threading, trusted controller exchanges, qualified native policies, durable admission, immutable failed attempts, whole-history resource fencing, broker clearance, publication and approved cleanup. The demonstrated no-document production-cleanup gap is included in the finding. Builder-reported passes at earlier commits were not treated as reviewer executions or fresh proof of the pinned version.

- **MED** `src/daemon/threads/review-workers.ts:324`: Carry the resolved epic/story locator into maintenance-worker admission. This resolves the cleanup target correctly, but the following admitOwned call omits the route and resolves the scope again from stored metadata.
  A supported no-document review can persist storyId 's1' with documents {}. describeStored infers epicHash only from a qualified STORY identifier or document filenames, so it returns no hash for that review. The second scope resolution then throws 'Canonical stored review epic/story locator required', leaving an otherwise eligible checkpoint permanently retained after BUILD approval. Preserve the resolved route through admission and add a production-resolver regression covering successful no-document review, publication and approved cleanup. Existing cleanup coverage injects its own scope resolver; the production no-document case covers failed-attempt recovery.
  Evidence: `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-cleanup-discovery.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/route-admission.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`, `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-worker-routing.test.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-native-policy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-worker-routing.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/task-review-plan-path.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/design-review-rpc.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/handler-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/index.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-native-policy.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/steps/design-review-step.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/steps/task-review-step.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/task-review-rpc.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-controller.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-cleanup-discovery.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-native-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-processes.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-contract.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-workers.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-resource-recovery.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/review-git-command.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/review-shell-process.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/mcp/__tests__/fixtures/tool-surface.golden.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/mcp/__tests__/schema-registry.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/mcp/code-review/schema.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/mcp/design-review/schema.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-resources.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/cleanup.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-native-host.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:design/task-review-final-scope-qualification.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-spawn-inventory.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/compatibility.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/route-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/route-documents.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/transition.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/controller.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/approval.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/subject.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/cli-review-session.test.ts`

### t15: passed

Reviewed all submitted Task 15 changed segments, the pinned design and plan, all eight acceptance checks, and relevant test bodies/assertions. No material defect found.

Coverage: **verified** — Coverage assessment is complete for the submitted scope. Assertions cover responsive cached progress during blocked admission; distinct worker identities and duplicate/stale-message refusal; bounded bootstrap failure; trusted controller exchanges and targeted disconnects; durable intent, permission denial, byte backpressure and native cleanup; whole-history resource fencing; broker-bound clearance with separate recovery; immutable failed attempts; and model-free publication/approval cleanup. Both review families are exercised through production construction and disposable full-daemon public routes. Relevant ownership, checkpoint, activity, progress, recovery, publication, approval and cleanup regression bodies were also inspected. Execution results remain builder-reported, not reviewer executions or proof of execution at the final pin.


Optional verification and advice (nonblocking):

- Optional execution: This reviewer did not run tests, integration checks, typechecks or builds. The recorded builder results below identify their tested commit; they are not claimed as executions of the final reviewed pin.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:.insrc/artifacts/TESTS-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/review-worker-runtime.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/worker-admission.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-processes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/review-worker-process.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-workers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-crash-daemon.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-controller.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-native-host.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-worker-routing.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-daemon.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/activity-execution.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/cleanup.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller-activity.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/activity-monitor.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/approval.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/cleanup.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/controller.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/persistence-fence.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/publication.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/recovery.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/subject-monitor.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/process-broker-native.test.ts`

Test: `npx tsx --test src/daemon/threads/__tests__/review-worker-isolation.test.ts` — pass
Builder-reported, corroborated by the committed TESTS ledger: tested commit 8fe4b316c850a6e25999e81f683a66818a838290, exit 0, 29904ms. Not executed by this reviewer.

Test: `npx tsx --test src/daemon/threads/__tests__/review-worker-recovery.test.ts` — pass
Builder-reported, corroborated by the committed TESTS ledger: tested commit 8fe4b316c850a6e25999e81f683a66818a838290, exit 0, 47678ms. Not executed by this reviewer.

Test: `npx tsx --test src/daemon/threads/__tests__/review-worker-daemon.test.ts` — pass
Builder-reported, corroborated by the committed TESTS ledger: tested commit 8fe4b316c850a6e25999e81f683a66818a838290, exit 0, 60713ms. Not executed by this reviewer.

### t16: passed

Completed review of all submitted Task16 segments and deletion anchors against the pinned design, plan and five acceptance checks. No material in-scope defects found. Packaging, executable lookup, recovery documentation and compatibility evidence support acceptance.

Coverage: **verified** — Inspected relevant test bodies and assertions, including compiled entrypoint discovery, both review families, controller feedback without provider dispatch, native-spawn refusal, Vibe transport disposal, isolation, recovery, immutable failed attempts, MCP schemas and supported-client DTOs. Reviewed release-order assertions and committed packet preparation. Checked reported compatibility failures and focused rerun evidence without treating historical executions as fresh pinned-version runs.


Optional verification and advice (nonblocking):

- Optional execution: No tests, typechecks, builds or deployed smoke were run by this reviewer. Builder logs were inspected as historical evidence; the selected Task16 files match commit 35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5.
- Optional execution: Full VS Code qualification retains seven disclosed failures; focused bundle/privacy reruns pass. Full JetBrains test compilation remains blocked by unrelated settings-test API errors; the focused 13 review tests pass in the supplied results. No full-client green or deployed-smoke claim is made.

Inspected references:

- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:.insrc/artifacts/TESTS-e4af63128c7cbec2-s1.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:design/review-worker-isolation-e4af6312.packet.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:design/task-review-final-scope-qualification.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/daemon.md`
- `262ef49221223eb568662db6d86b1cb8a07091a3:docs/workflow.md`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/vibe-session.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/review-native-guard.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-native-policy.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/review-service.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/review-shell-process.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-daemon.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-worker-rpc.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-spawn-inventory.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-package.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/controller-fixture.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-worker-routing.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/code-review/task-review/__tests__/transition.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/workflow/review/design-review/__tests__/readers.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/daemon/__tests__/review-native-policy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/mcp/__tests__/schema-registry.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/cli-review-session.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/agent/providers/__tests__/review-worker-process.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:src/shared/__tests__/process-broker-native.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/review-frame-message.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/review-presenter.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/docs-review-client.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/connections/__tests__/privacy.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/chat-panel.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/chat/__tests__/chat-theme.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:vscode-plugin/src/config/__tests__/per-role.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentTest.kt`
- `262ef49221223eb568662db6d86b1cb8a07091a3:package.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:tsconfig.json`
- `262ef49221223eb568662db6d86b1cb8a07091a3:copy-assets.mjs`
- `262ef49221223eb568662db6d86b1cb8a07091a3:scripts/forbidden-spawn-scan.mjs`
## worker-isolation-e4af6312-whole-story — attempt 3

Scope: whole story · reviewer: daemon · 2026-11-13T12:38:54.876Z

16 selected task assessment(s): failed.
Native output diagnostics: [{"phase":"assessment","taskId":"t6","provider":"codex","resolved":false,"errors":[{"code":"HOST_VALIDATION_ERROR","field":"commit","correction":"Correct the host-rejected review field before resubmitting.","occurrences":1}]}]

### Submitted scope

- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/shared/__tests__/review-resources.test.ts` — [{"after":[1,34]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/shared/review-resources.ts` — [{"after":[1,46]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` — [{"after":[1,42]},{"after":[44,84]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[1,45]},{"after":[47,66]},{"after":[68,70]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/checkpoint.ts` — [{"after":[9,10]},{"after":[32,35]},{"after":[37,38]},{"after":[79,85]},{"after":[92,92]}]
- `1191a535261b6fc6439444bf70ad6395f92a92f3:src/workflow/code-review/task-review/contracts.ts` — [{"after":[11,12]},{"after":[107,108]},{"after":[132,148]},{"after":[150,150]},{"after":[152,165]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — [{"after":[1,45]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[6,7]},{"after":[9,9]},{"after":[51,103]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/__tests__/fixtures.ts` — [{"after":[9,9]},{"after":[22,31]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[1,2]},{"after":[4,17]},{"after":[19,29]},{"after":[33,37]},{"after":[41,48]},{"after":[50,53]},{"after":[55,56]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/checkpoint.ts` — [{"after":[11,13]},{"after":[138,143]},{"after":[157,158]},{"after":[173,179]},{"after":[192,193]},{"after":[197,198]},{"after":[200,200]},{"after":[204,209]},{"after":[212,212]},{"after":[214,215]},{"after":[217,219]},{"after":[223,223]},{"after":[225,228]},{"after":[230,230]},{"after":[232,234]},{"after":[236,236]},{"after":[238,247]},{"after":[251,251]}]
- `de557365b222b1af68b4da03caaad954bebc4809:src/workflow/review/design-review/contracts.ts` — [{"after":[6,6]},{"after":[218,224]},{"after":[226,235]},{"after":[237,251]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` — [{"after":[23,26]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` — [{"after":[103,130]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[18,24]}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/checkpoint.ts` — [{"after":[163,166]},{"after":[224,224]},{"after":[228,234]},{"after":[241,241]},{"after":[245,245]},{"deletionAt":257}]
- `81edc5d07d0ca09fb832f84a07f433c50375d10b:src/workflow/review/design-review/contracts.ts` — [{"after":[225,227]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[1,70]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` — [{"after":[1,38]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[67,67]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/admission.ts` — [{"after":[71,71]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/completion.ts` — [{"after":[10,10]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/contracts.ts` — [{"after":[109,109]},{"after":[124,125]},{"after":[152,152]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/history.ts` — [{"after":[1,5]},{"after":[7,17]},{"after":[19,21]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/publication.ts` — [{"after":[10,13]},{"after":[18,19]},{"after":[24,24]},{"after":[29,35]},{"after":[37,37]},{"after":[70,70]},{"after":[78,78]},{"after":[81,83]},{"after":[100,104]},{"after":[112,123]},{"after":[125,133]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/code-review/task-review/record.ts` — [{"after":[6,8]},{"after":[22,26]},{"after":[41,44]},{"after":[46,46]},{"after":[50,50]},{"after":[52,57]},{"after":[79,79]},{"after":[85,85]},{"after":[90,90]},{"after":[96,109]},{"after":[114,114]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[1,3]},{"after":[5,8]},{"after":[10,74]},{"after":[77,77]},{"after":[82,83]},{"after":[85,90]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[44,45]},{"after":[47,47]},{"after":[49,50]},{"after":[53,53]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/approval.ts` — [{"after":[14,15]},{"after":[18,20]},{"after":[22,22]},{"after":[27,32]},{"after":[36,59]},{"after":[91,92]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/checkpoint.ts` — [{"after":[60,61]},{"after":[63,63]},{"after":[109,109]},{"after":[116,117]},{"after":[199,201]},{"deletionAt":203},{"after":[205,206]},{"after":[213,214]},{"after":[216,216]},{"after":[219,219]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/contracts.ts` — [{"after":[238,239]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/history.ts` — [{"after":[6,6]},{"after":[8,11]},{"after":[18,18]},{"after":[33,39]},{"after":[41,45]},{"after":[50,54]},{"after":[64,66]},{"after":[68,68]},{"after":[85,85]},{"after":[102,102]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/provenance.ts` — [{"after":[8,8]},{"after":[14,14]},{"after":[28,28]},{"after":[34,34]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/publication.ts` — [{"after":[12,12]},{"after":[15,17]},{"after":[24,28]},{"after":[43,45]},{"after":[48,49]},{"after":[65,67]},{"after":[71,75]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/read.ts` — [{"after":[5,5]},{"after":[7,8]},{"after":[11,15]},{"after":[27,31]},{"after":[35,35]},{"after":[37,37]},{"after":[41,41]},{"after":[43,43]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/design-review/results.ts` — [{"after":[16,16]},{"after":[20,20]},{"after":[138,138]},{"after":[155,155]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/report-log.ts` — [{"after":[111,111]}]
- `febda151ec65faa5e5f26dc0f19e969b3313926f:src/workflow/review/resource-audit.ts` — [{"after":[1,55]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/artifact-core/codecs.ts` — [{"after":[103,103]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[13,13]},{"after":[33,35]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/coordinator.ts` — [{"after":[16,16]},{"after":[20,20]},{"after":[115,115]},{"after":[118,120]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/code-review/task-review/progress-view.ts` — [{"after":[9,9]},{"after":[16,16]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[9,9]},{"after":[17,17]},{"after":[27,30]},{"after":[80,83]},{"after":[89,102]},{"after":[104,109]},{"after":[118,121]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/contracts.ts` — [{"after":[160,160]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/coordinator.ts` — [{"after":[16,18]},{"deletionAt":31},{"after":[271,271]},{"after":[274,282]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/progress.ts` — [{"after":[4,6]},{"after":[79,93]}]
- `d6331139b7e6b51d05fdffa9f54ff1416146648f:src/workflow/review/design-review/publication.ts` — [{"after":[7,7]},{"after":[11,11]},{"after":[18,18]},{"after":[21,28]},{"after":[63,63]},{"after":[69,88]},{"after":[90,90]},{"after":[122,123]},{"after":[126,126]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/threads/__tests__/review-processes.test.ts` — [{"after":[1,154]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/threads/review-processes.ts` — [{"after":[1,13]},{"after":[51,139]},{"after":[141,143]},{"after":[145,179]},{"after":[182,210]},{"after":[212,213]},{"after":[215,251]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/daemon/tools/shell-helper.ts` — [{"after":[18,19]},{"after":[83,84]},{"after":[87,87]},{"after":[109,109]},{"after":[143,143]},{"after":[147,147]},{"after":[156,156]}]
- `afe013f2c2e5caa0607710b33a05b237ed2a5144:src/shared/process-group.ts` — [{"after":[23,25]},{"after":[27,46]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[1,16]},{"after":[18,19]},{"after":[21,29]},{"after":[31,41]},{"after":[43,71]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/agent/providers/cli-provider.ts` — [{"after":[71,71]},{"after":[1145,1147]},{"after":[1176,1176]},{"after":[1179,1179]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/daemon/threads/review-processes.ts` — [{"after":[14,15]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/process-group.ts` — [{"after":[24,24]},{"after":[104,105]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/review-native.ts` — [{"after":[1,35]},{"after":[37,41]}]
- `9146afc68c9e8f4b85305da602f5ce80a8d9a27a:src/shared/review-process-bridge.ts` — [{"after":[1,17]},{"after":[19,21]},{"after":[23,61]},{"after":[63,69]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/agent/providers/__tests__/helpers/review-process-worker.mjs` — [{"after":[1,20]},{"after":[22,31]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[5,5]},{"after":[47,72]},{"after":[92,98]},{"after":[107,109]}]
- `bb08cd12c710da5aa2d96cb24c46c7f9cf6b068f:src/shared/review-process-bridge.ts` — [{"after":[4,4]},{"after":[23,29]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/agent/providers/__tests__/helpers/review-process-worker.mjs` — [{"after":[4,5]},{"after":[21,21]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[33,34]},{"after":[62,62]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/__tests__/helpers/review-shell-host.ts` — [{"after":[1,9]},{"after":[11,12]},{"after":[14,15]},{"after":[18,18]},{"after":[20,24]},{"after":[26,28]},{"after":[30,37]},{"after":[39,39]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/__tests__/review-spawn-inventory.test.ts` — [{"after":[1,21]},{"after":[23,24]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/threads/review-processes.ts` — [{"after":[13,13]},{"after":[110,110]},{"after":[146,147]},{"after":[180,183]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[1,8]},{"after":[10,14]},{"after":[16,49]},{"after":[51,53]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[1,18]},{"after":[20,22]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/review-shell-process.ts` — [{"after":[1,11]},{"after":[13,22]},{"after":[24,62]},{"after":[64,73]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/daemon/tools/shell-helper.ts` — [{"after":[20,21]},{"after":[103,104]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-native-guard.ts` — [{"after":[1,27]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-native.ts` — [{"after":[36,36]}]
- `700f2316357605c1fcb67ac8d30065e0ee285ce7:src/shared/review-process-bridge.ts` — [{"after":[16,17]},{"after":[21,21]},{"after":[25,26]},{"after":[73,73]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/threads/__tests__/helpers/review-shell-host.ts` — [{"after":[6,8]},{"after":[10,11]},{"after":[15,15]},{"after":[18,24]},{"after":[27,30]},{"after":[32,39]},{"after":[42,42]},{"after":[46,46]},{"after":[50,50]},{"after":[59,59]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[9,9]},{"after":[12,12]},{"after":[16,16]},{"after":[31,36]},{"after":[42,56]},{"after":[72,72]}]
- `38163fd3cee7a5b7942124750e792afb92483a05:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[7,9]},{"after":[22,22]},{"after":[25,31]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/threads/review-processes.ts` — [{"after":[177,177]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[32,35]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[32,33]}]
- `de3efb1e170c26109ad0a20300db15a9c144ec16:src/daemon/tools/review-shell-process.ts` — [{"after":[63,63]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/threads/__tests__/review-spawn-inventory.test.ts` — [{"after":[22,22]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — [{"after":[31,36]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/daemon/tools/__tests__/review-worker-shell.test.ts` — [{"after":[34,34]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/shared/review-native-guard.ts` — [{"after":[16,16]}]
- `43d69ad70bc0d70ae4639c3dc10e20e34cd8dd74:src/shared/vibe-session.ts` — [{"after":[7,9]},{"after":[99,101]},{"after":[103,104]},{"after":[225,225]},{"after":[227,231]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts` — [{"after":[1,11]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — [{"after":[1,3]},{"after":[5,10]},{"after":[12,30]},{"after":[32,32]},{"after":[36,69]},{"after":[71,90]},{"after":[92,94]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-admission.ts` — [{"after":[1,4]},{"after":[6,17]},{"after":[19,21]},{"after":[23,24]},{"after":[26,31]},{"after":[33,37]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[1,6]},{"after":[8,17]},{"after":[19,20]},{"after":[22,26]},{"after":[28,30]},{"after":[32,36]},{"after":[38,58]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-contract.ts` — [{"after":[1,27]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-native.ts` — [{"after":[1,34]},{"after":[36,46]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker-runtime.ts` — [{"after":[1,1]},{"after":[4,15]},{"after":[17,27]},{"after":[29,36]},{"after":[41,44]},{"after":[46,48]},{"after":[50,54]},{"after":[57,58]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/review-worker.ts` — [{"after":[1,9]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/daemon/threads/workers.ts` — [{"after":[74,79]},{"after":[81,84]}]
- `07d92f8bea89c60e48d086139befded5045511d4:src/workflow/review/design-review/coordinator.ts` — [{"after":[7,7]},{"after":[82,82]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — [{"after":[4,4]},{"after":[11,11]},{"after":[20,21]},{"after":[33,57]},{"after":[59,62]},{"after":[65,65]},{"after":[74,78]},{"after":[93,93]},{"after":[100,100]},{"after":[103,103]},{"after":[106,106]},{"after":[111,111]},{"after":[114,114]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[7,7]},{"after":[13,13]},{"after":[19,33]},{"after":[36,36]},{"after":[40,40]},{"after":[43,44]},{"after":[48,48]},{"after":[54,54]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker-runtime.ts` — [{"after":[2,3]},{"after":[12,12]},{"after":[46,46]},{"after":[53,66]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/daemon/threads/review-worker.ts` — [{"after":[8,9]}]
- `8e26d2c88a7731a8ab0f381aefd538efe3c5a427:src/shared/review-native-guard.ts` — [{"after":[24,24]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[1,2]},{"after":[4,33]},{"after":[36,59]},{"after":[61,70]},{"after":[72,81]},{"after":[83,84]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-native-host.ts` — [{"after":[1,69]},{"after":[71,106]},{"after":[110,119]},{"after":[122,122]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-bootstrap.ts` — [{"after":[18,18]},{"after":[68,68]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-native.ts` — [{"after":[16,16]},{"after":[36,36]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-resources.ts` — [{"after":[1,17]},{"after":[19,30]},{"after":[32,34]},{"after":[36,37]},{"after":[39,39]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-worker-runtime.ts` — [{"after":[26,28]},{"after":[51,52]},{"after":[71,74]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/review-workers.ts` — [{"after":[1,26]},{"after":[29,40]},{"after":[42,70]},{"after":[72,80]},{"after":[82,83]},{"after":[85,86]},{"after":[89,91]},{"after":[94,94]},{"after":[97,108]},{"after":[110,118]},{"after":[120,123]},{"after":[125,142]},{"after":[144,146]},{"after":[148,148]},{"after":[151,153]},{"after":[155,155]},{"after":[158,161]},{"after":[163,177]},{"after":[179,179]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/daemon/threads/status-board.ts` — [{"after":[23,23]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/shared/review-native.ts` — [{"after":[42,47]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/shared/types.ts` — [{"after":[1242,1242]},{"after":[1249,1249]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/workflow/code-review/task-review/checkpoint.ts` — [{"after":[26,30]},{"after":[36,36]},{"after":[41,46]}]
- `2b4d3a339e9a3668ebc663547279ac651b25efe6:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[6,6]},{"after":[37,38]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[3,3]},{"after":[31,32]},{"after":[36,37]},{"after":[59,59]},{"after":[63,63]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/review-worker-runtime.ts` — [{"after":[40,40]},{"after":[51,52]},{"after":[54,54]},{"after":[56,65]},{"after":[67,67]}]
- `d82e527a026947dfa3bd866a4aaaa27ea66f0faf:src/daemon/threads/review-workers.ts` — [{"after":[41,42]},{"after":[150,152]}]
- `1635e86d6bc9d87788887809913651adfb3f005c:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[14,15]},{"after":[93,111]}]
- `1635e86d6bc9d87788887809913651adfb3f005c:src/daemon/threads/review-worker-admission.ts` — [{"after":[5,5]},{"after":[18,20]},{"after":[24,24]},{"after":[27,27]},{"after":[29,29]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-worker-contract.ts` — [{"after":[16,17]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-worker-runtime.ts` — [{"after":[29,32]},{"after":[54,54]},{"after":[56,56]},{"after":[58,60]},{"after":[62,63]},{"after":[65,66]},{"after":[84,84]},{"after":[86,91]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/daemon/threads/review-workers.ts` — [{"after":[24,24]},{"after":[90,90]},{"after":[95,95]},{"after":[98,101]},{"after":[154,155]},{"after":[157,158]},{"after":[161,161]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/admission.test.ts` — [{"after":[12,12]},{"after":[49,49]},{"after":[111,111]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` — [{"after":[1,29]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[1,81]},{"after":[84,84]},{"after":[86,87]},{"after":[89,99]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/admission.ts` — [{"after":[10,10]},{"after":[29,36]},{"after":[38,38]},{"after":[46,50]},{"after":[55,55]},{"after":[106,106]},{"after":[113,113]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/controller.ts` — [{"after":[57,57]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/coordinator.ts` — [{"after":[37,37]},{"after":[69,69]},{"after":[136,136]},{"after":[147,147]},{"after":[150,150]},{"after":[184,184]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/progress.ts` — [{"after":[25,25]},{"after":[29,33]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[1,26]},{"after":[28,61]}]
- `e57dc09f2e21d48c4e73f9492310a3fa73657c55:src/workflow/code-review/task-review/worker-checkpoint.ts` — [{"after":[1,6]},{"after":[8,57]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-worker-admission.ts` — [{"after":[21,24]},{"after":[26,29]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-worker-contract.ts` — [{"after":[18,18]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/daemon/threads/review-workers.ts` — [{"after":[86,86]},{"after":[156,156]},{"after":[159,160]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[82,82]},{"after":[85,93]},{"after":[96,96]},{"after":[98,109]}]
- `76e049edb241d69b1145c3f8fe411347166e19c8:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[27,31]},{"after":[50,56]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-worker-contract.ts` — [{"after":[19,19]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-worker-runtime.ts` — [{"deletionAt":16},{"after":[32,33]},{"after":[37,37]},{"after":[50,50]},{"after":[63,63]},{"after":[66,67]},{"after":[101,101]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-workers.ts` — [{"after":[83,83]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` — [{"after":[1,28]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/__tests__/worker-admission.test.ts` — [{"after":[1,2]},{"after":[4,28]},{"after":[31,31]},{"after":[34,34]},{"after":[36,49]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/coordinator.ts` — [{"after":[52,53]},{"after":[103,103]},{"after":[232,232]},{"after":[234,234]},{"after":[255,255]},{"after":[264,264]},{"after":[287,287]},{"after":[289,289]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/worker-admission.ts` — [{"after":[1,5]},{"after":[7,32]},{"after":[34,36]},{"after":[38,42]},{"after":[44,74]},{"after":[77,78]}]
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/workflow/review/design-review/worker-checkpoint.ts` — [{"after":[1,18]},{"after":[20,27]},{"after":[29,30]},{"after":[32,34]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-worker-admission.ts` — [{"after":[11,11]},{"after":[41,43]},{"after":[45,46]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-worker-runtime.ts` — [{"after":[35,35]},{"after":[59,61]},{"after":[63,65]},{"after":[70,71]},{"after":[73,73]},{"after":[80,80]},{"after":[82,83]},{"after":[88,88]},{"after":[90,90]},{"after":[101,101]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/daemon/threads/review-workers.ts` — [{"after":[18,18]},{"after":[49,49]},{"after":[98,99]},{"after":[155,163]},{"after":[172,174]},{"after":[178,178]},{"after":[186,186]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/action-admission.test.ts` — [{"after":[1,41]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` — [{"after":[9,9]},{"after":[14,19]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` — [{"after":[88,88]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/__tests__/worker-admission.test.ts` — [{"after":[3,3]},{"after":[15,15]},{"after":[30,31]},{"after":[34,34]},{"after":[36,36]},{"after":[51,110]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/action-admission.ts` — [{"after":[1,21]},{"after":[23,43]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/action-state.ts` — [{"after":[1,13]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[7,7]},{"after":[18,18]},{"after":[46,47]},{"after":[51,51]},{"after":[53,54]},{"after":[71,80]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/checkpoint.ts` — [{"after":[15,15]},{"after":[35,35]},{"after":[46,46]},{"after":[59,59]},{"after":[76,76]},{"after":[126,126]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/contracts.ts` — [{"after":[70,71]},{"after":[236,236]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/coordinator.ts` — [{"deletionAt":5},{"after":[33,33]},{"after":[156,156]},{"after":[205,205]},{"after":[223,223]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/recovery-state.ts` — [{"after":[5,5]},{"after":[55,55]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/request-signature.ts` — [{"after":[1,6]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/worker-admission.ts` — [{"after":[12,13]},{"after":[23,25]},{"after":[28,28]},{"after":[39,41]},{"after":[45,46]},{"after":[50,50]},{"after":[56,59]},{"after":[61,82]},{"after":[84,84]},{"after":[96,96]},{"after":[115,116]},{"after":[118,118]}]
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/worker-checkpoint.ts` — [{"after":[6,6]},{"after":[20,22]},{"after":[31,34]},{"after":[37,38]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[1,24]},{"after":[32,39]},{"after":[41,54]},{"after":[56,56]},{"after":[58,61]},{"after":[64,64]},{"after":[67,67]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/helpers/review-crash-daemon.ts` — [{"after":[1,13]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[1,80]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[1,2]},{"after":[5,61]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-native-host.ts` — [{"after":[121,127]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-processes.ts` — [{"after":[214,220]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-resource-recovery.ts` — [{"after":[1,23]},{"after":[25,26]},{"after":[28,40]},{"after":[42,43]},{"after":[45,67]},{"after":[69,69]},{"after":[71,74]},{"after":[76,86]},{"after":[88,89]},{"after":[91,92]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-resource-worker.ts` — [{"after":[1,22]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-worker-runtime.ts` — [{"after":[36,36]},{"after":[141,141]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/daemon/threads/review-workers.ts` — [{"after":[19,21]},{"after":[66,66]},{"after":[75,75]},{"after":[96,96]},{"after":[200,200]},{"after":[203,203]},{"after":[205,205]},{"after":[208,218]},{"after":[229,229]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/shared/process-group.ts` — [{"after":[27,27]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/shared/review-resources.ts` — [{"after":[5,5]},{"after":[33,40]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[3,4]},{"after":[42,47]},{"after":[72,73]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/design-review/checkpoint.ts` — [{"after":[13,13]},{"after":[241,241]},{"after":[249,249]}]
- `58667fd89da8bc1793e28f672f6fe29d2f4db305:src/workflow/review/resource-recovery.ts` — [{"after":[1,24]},{"after":[26,27]},{"after":[29,64]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[23,24]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[38,40]},{"after":[42,42]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/review-worker-admission.ts` — [{"after":[32,32]},{"after":[52,52]}]
- `11aaac85dfaff9e58d7185ce2436176a69cac9b4:src/daemon/threads/review-worker-runtime.ts` — [{"after":[79,79]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[55,55]},{"after":[57,58]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/daemon/threads/__tests__/review-worker-clearance.test.ts` — [{"after":[83,110]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/workflow/review/design-review/checkpoint.ts` — [{"after":[61,62]}]
- `f3c1b184a1de14e1b937f701c0ba9ba834f33e36:src/workflow/review/design-review/coordinator.ts` — [{"after":[235,236]},{"after":[239,239]},{"after":[247,247]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` — [{"after":[1,30]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — [{"after":[80,80]},{"after":[1892,1892]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt` — [{"after":[1,37]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt` — [{"after":[58,58]},{"after":[63,63]},{"after":[204,210]},{"after":[216,218]},{"after":[227,228]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt` — [{"after":[148,149]},{"after":[162,171]},{"after":[210,210]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt` — [{"after":[1,21]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt` — [{"after":[1,25]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/cli/panes/DaemonPane.tsx` — [{"after":[12,12]},{"after":[116,116]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[63,64]},{"after":[66,67]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/review-worker-progress.test.ts` — [{"after":[1,85]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[76,76]},{"after":[90,90]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/admin-status.ts` — [{"after":[56,56]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/main-services.ts` — [{"after":[17,17]},{"after":[168,168]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-progress.ts` — [{"after":[1,29]},{"after":[31,38]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-worker-contract.ts` — [{"after":[26,26]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-worker-runtime.ts` — [{"after":[2,3]},{"after":[38,38]},{"after":[58,64]},{"after":[84,84]},{"after":[94,94]},{"after":[155,156]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/review-workers.ts` — [{"after":[21,24]},{"after":[47,47]},{"after":[141,141]},{"after":[143,143]},{"after":[147,147]},{"after":[166,169]},{"after":[199,200]},{"after":[202,202]},{"after":[204,207]},{"after":[212,212]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/status-board.ts` — [{"after":[14,14]},{"after":[23,24]},{"after":[177,177]},{"after":[195,195]},{"after":[210,210]},{"after":[230,230]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/daemon/threads/worker-entry.ts` — [{"after":[16,17]},{"after":[79,79]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/shared/review-worker-progress.ts` — [{"after":[1,28]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/shared/types.ts` — [{"after":[1246,1246]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/artifact-content.ts` — [{"after":[1,1]},{"after":[60,60]},{"after":[239,239]},{"after":[244,244]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` — [{"after":[16,16]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/review/design-review/worker-admission.ts` — [{"after":[29,29]},{"after":[118,118]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:src/workflow/review/worker-progress-source.ts` — [{"after":[1,10]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — [{"after":[1251,1255]},{"after":[1822,1822]},{"after":[1896,1896]},{"after":[1985,1985]},{"after":[7588,7599]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` — [{"after":[1,20]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/docs-review-client.ts` — [{"after":[36,36]},{"after":[191,191]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/docs-review-panel.ts` — [{"after":[1,1]},{"after":[107,108]},{"after":[1419,1427]},{"after":[1536,1536]},{"after":[1585,1585]},{"after":[1615,1615]},{"after":[2270,2270]},{"after":[2276,2276]},{"after":[2389,2389]},{"after":[2431,2431]}]
- `47b80497ec3d13301ecaf2fef33aa6a1e4af0a7a:vscode-plugin/src/chat/protocol.ts` — [{"after":[157,157]},{"after":[175,176]}]
- `8cf777a4a03f39ad00f4e6fe1da26ee8c6ad1075:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[76,78]},{"after":[87,88]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/artifact-write-authority.test.ts` — [{"after":[1,31]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/helpers/artifact-writer.ts` — [{"after":[1,14]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/helpers/review-maintenance.ts` — [{"after":[1,9]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-cleanup.test.ts` — [{"after":[1,3]},{"after":[5,90]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-publication.test.ts` — [{"after":[1,37]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[9,37]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/artifact-write-authority.ts` — [{"after":[1,49]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/main-services.ts` — [{"after":[18,20]},{"after":[159,162]},{"after":[176,176]},{"after":[179,179]},{"after":[217,217]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[1,20]},{"after":[22,28]},{"after":[33,33]},{"after":[35,52]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-progress.ts` — [{"after":[30,30]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-worker-contract.ts` — [{"after":[19,20]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-worker-runtime.ts` — [{"after":[36,36]},{"after":[40,44]},{"after":[59,69]},{"after":[72,72]},{"after":[77,80]},{"after":[89,100]},{"after":[102,112]},{"after":[115,120]},{"after":[139,139]},{"after":[153,153]},{"after":[208,214]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/review-workers.ts` — [{"after":[26,31]},{"after":[63,63]},{"after":[77,77]},{"after":[88,88]},{"after":[91,93]},{"after":[100,100]},{"after":[110,113]},{"after":[123,123]},{"after":[126,127]},{"after":[138,138]},{"after":[161,161]},{"after":[193,206]},{"after":[210,210]},{"after":[222,222]},{"after":[233,233]},{"after":[260,307]},{"after":[310,319]},{"after":[324,324]},{"after":[350,358]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/worker-entry.ts` — [{"after":[17,20]},{"after":[83,88]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/daemon/threads/workers.ts` — [{"after":[86,86]},{"after":[88,92]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/artifact-core/store.ts` — [{"after":[15,15]},{"after":[258,258]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/artifact-core/write-authority.ts` — [{"after":[1,10]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/code-review/task-review/cleanup.ts` — [{"after":[1,1]},{"after":[5,11]},{"after":[17,17]},{"after":[25,25]},{"after":[29,29]},{"after":[34,34]},{"after":[36,38]},{"after":[41,41]},{"after":[46,53]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[20,20]},{"after":[38,40]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/cleanup-owner.ts` — [{"after":[1,11]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/cleanup.ts` — [{"after":[9,12]},{"after":[15,16]},{"after":[20,21]},{"after":[43,44]},{"after":[46,47]},{"after":[54,54]},{"after":[58,58]},{"after":[62,62]},{"after":[78,78]},{"after":[96,96]},{"after":[103,103]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/coordinator.ts` — [{"after":[2,2]},{"after":[276,279]}]
- `f8cda86707974bc452d806eacd7b91a7bf409f43:src/workflow/review/design-review/worker-admission.ts` — [{"after":[6,6]},{"after":[26,26]},{"after":[55,61]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/review-native-policy.test.ts` — [{"after":[1,43]},{"after":[45,57]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[1,2]},{"after":[4,6]},{"after":[8,9]},{"after":[11,14]},{"after":[16,21]},{"after":[23,35]},{"after":[37,45]},{"after":[47,56]},{"after":[60,62]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/__tests__/task-review-plan-path.test.ts` — [{"after":[4,4]},{"deletionAt":6},{"after":[9,9]},{"after":[16,16]},{"after":[25,28]},{"after":[30,42]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/design-review-rpc.ts` — [{"after":[1,2]},{"after":[4,8]},{"after":[10,10]},{"after":[14,14]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/handler-runtime.ts` — [{"after":[146,146]},{"after":[706,707]},{"after":[975,976]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/index.ts` — [{"after":[71,72]},{"after":[271,271]},{"after":[277,280]},{"deletionAt":283},{"after":[307,307]},{"after":[417,422]},{"after":[512,512]},{"after":[662,662]},{"after":[681,681]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/review-native-policy.ts` — [{"after":[1,23]},{"after":[25,80]},{"after":[82,91]},{"after":[93,94]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/review-service.ts` — [{"after":[1,54]},{"after":[56,60]},{"after":[63,107]},{"after":[109,110]},{"after":[114,187]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/steps/design-review-step.ts` — [{"deletionAt":1},{"after":[3,4]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/steps/task-review-step.ts` — [{"deletionAt":0},{"after":[6,6]},{"after":[10,10]},{"after":[14,14]},{"after":[17,17]},{"after":[21,23]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/task-review-rpc.ts` — [{"deletionAt":0},{"after":[2,4]},{"after":[6,12]},{"after":[14,17]},{"after":[19,19]},{"after":[25,35]},{"after":[39,45]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/__tests__/helpers/review-controller.ts` — [{"after":[1,2]},{"after":[4,12]},{"after":[16,18]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[24,37]},{"after":[43,44]},{"after":[47,49]},{"after":[51,55]},{"after":[65,65]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-native-host.ts` — [{"after":[81,83]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-processes.ts` — [{"after":[106,106]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-contract.ts` — [{"after":[22,23]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-resources.ts` — [{"after":[7,8]},{"after":[20,20]},{"after":[33,33]},{"after":[37,37]},{"after":[40,40]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-worker-runtime.ts` — [{"after":[45,45]},{"after":[52,56]},{"after":[64,65]},{"after":[77,77]},{"after":[96,104]},{"after":[129,130]},{"after":[187,188]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/threads/review-workers.ts` — [{"after":[42,43]},{"after":[97,97]},{"after":[120,120]},{"after":[136,136]},{"after":[139,139]},{"after":[285,289]},{"after":[345,350]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/tools/review-git-command.ts` — [{"after":[1,15]}]
- `07db729ca04008c97385ce38c24debee49182914:src/daemon/tools/review-shell-process.ts` — [{"after":[5,6]},{"after":[15,15]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/__tests__/fixtures/tool-surface.golden.json` — [{"after":[492,521]},{"after":[1515,1539]},{"after":[1826,1826]},{"after":[2014,2014]},{"after":[2032,2032]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/__tests__/schema-registry.test.ts` — [{"after":[49,49]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/code-review/schema.ts` — [{"after":[6,6]},{"after":[12,13]}]
- `07db729ca04008c97385ce38c24debee49182914:src/mcp/design-review/schema.ts` — [{"after":[4,4]},{"after":[11,11]}]
- `07db729ca04008c97385ce38c24debee49182914:src/shared/review-native.ts` — [{"after":[24,25]}]
- `07db729ca04008c97385ce38c24debee49182914:src/shared/review-resources.ts` — [{"after":[18,21]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[8,12]},{"after":[30,39]},{"after":[48,52]},{"after":[54,58]},{"after":[63,63]},{"after":[66,67]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/controller.test.ts` — [{"after":[22,22]},{"after":[43,43]},{"after":[47,47]},{"after":[51,51]},{"after":[59,59]},{"after":[62,62]},{"after":[78,78]},{"after":[82,82]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/ownership.test.ts` — [{"after":[6,6]},{"after":[13,13]},{"after":[21,21]},{"after":[24,24]},{"after":[30,31]},{"after":[33,33]},{"after":[35,35]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/__tests__/progress-client.test.ts` — [{"after":[10,11]},{"after":[20,20]},{"after":[25,25]},{"after":[30,30]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/code-review/task-review/worker-checkpoint.ts` — [{"after":[7,7]},{"after":[47,50]}]
- `07db729ca04008c97385ce38c24debee49182914:src/workflow/review/design-review/cleanup.ts` — [{"deletionAt":26},{"after":[82,82]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[3,6]},{"after":[10,10]},{"after":[13,13]},{"after":[16,19]},{"after":[22,22]},{"after":[29,29]},{"after":[40,44]},{"after":[48,48]},{"after":[50,50]},{"after":[52,53]},{"after":[60,61]},{"after":[63,65]},{"after":[73,80]},{"after":[84,102]},{"after":[106,115]},{"after":[117,137]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/review-service.ts` — [{"after":[61,62]},{"after":[77,77]},{"after":[108,114]},{"after":[116,116]},{"after":[119,119]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-resource-recovery.ts` — [{"after":[21,23]},{"after":[27,27]},{"after":[30,30]},{"after":[44,44]},{"after":[47,47]},{"after":[71,71]},{"after":[73,73]},{"after":[78,78]},{"after":[90,90]},{"after":[93,93]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-worker-admission.ts` — [{"after":[25,25]},{"deletionAt":26}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-worker-runtime.ts` — [{"after":[175,175]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-workers.ts` — [{"after":[108,108]},{"after":[289,289]},{"after":[314,314]},{"after":[327,327]},{"after":[329,329]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/workflow/code-review/task-review/admission.ts` — [{"after":[98,98]}]
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/workflow/code-review/task-review/worker-admission.ts` — [{"after":[20,20]},{"after":[59,59]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[20,21]},{"after":[140,165]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/daemon/threads/review-worker-runtime.ts` — [{"after":[141,141]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/admission-history.test.ts` — [{"after":[4,4]},{"after":[82,82]},{"after":[85,88]},{"after":[112,112]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts` — [{"deletionAt":2},{"after":[30,35]},{"after":[45,45]},{"after":[47,47]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/correction-admission.test.ts` — [{"after":[59,59]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/publication.test.ts` — [{"after":[99,99]},{"after":[108,112]},{"after":[114,114]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/action-admission.ts` — [{"after":[16,16]},{"after":[23,23]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/admission-checkpoint.ts` — [{"after":[88,88]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/checkpoint.ts` — [{"after":[60,60]}]
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/coordinator.ts` — [{"after":[131,131]},{"after":[156,156]},{"after":[168,168]},{"after":[178,178]},{"deletionAt":184},{"after":[189,189]},{"after":[199,199]},{"after":[229,229]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/__tests__/review-native-host.test.ts` — [{"after":[1,27]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[14,14]},{"after":[17,33]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/daemon/threads/review-native-host.ts` — [{"after":[36,38]},{"after":[73,73]},{"after":[113,116]},{"after":[120,120]},{"after":[128,128]},{"after":[136,136]}]
- `c7611f35010772f23bcc503190752285561bdd5c:src/workflow/review/resource-recovery.ts` — [{"after":[25,25]},{"after":[28,28]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:design/task-review-final-scope-qualification.json` — [{"after":[350,350]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[118,118]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/__tests__/helpers/review-controller.ts` — [{"after":[3,3]},{"after":[13,27]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[57,57]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-worker-runtime.ts` — [{"after":[117,117]},{"after":[142,142]},{"after":[147,147]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/daemon/threads/review-workers.ts` — [{"after":[128,128]},{"after":[136,145]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/artifact-core/codecs.ts` — [{"after":[20,20]},{"after":[104,104]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/capacity.test.ts` — [{"after":[52,52]},{"after":[66,66]},{"after":[93,93]},{"after":[109,109]},{"after":[113,113]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/cleanup.test.ts` — [{"after":[15,15]},{"after":[95,96]},{"after":[103,103]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/compatibility.test.ts` — [{"after":[30,30]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` — [{"after":[4,4]},{"after":[18,19]},{"after":[22,22]},{"after":[33,35]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[34,35]},{"after":[49,53]},{"after":[60,69]},{"after":[83,83]},{"after":[89,89]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — [{"after":[236,236]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` — [{"after":[66,66]},{"after":[85,85]},{"after":[97,97]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/history.test.ts` — [{"after":[61,61]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` — [{"after":[1,43]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts` — [{"after":[19,19]},{"after":[22,22]},{"after":[37,38]},{"after":[44,44]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/recovery.test.ts` — [{"after":[11,11]},{"after":[30,30]},{"after":[41,41]},{"after":[47,47]},{"after":[53,53]},{"after":[56,56]},{"after":[61,61]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` — [{"after":[86,86]},{"after":[119,119]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/admission-checkpoint.ts` — [{"after":[46,46]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/admission.ts` — [{"after":[78,78]},{"after":[80,80]},{"after":[108,108]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/capacity.ts` — [{"after":[12,12]},{"after":[85,87]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/cleanup.ts` — [{"after":[33,33]},{"after":[44,44]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/completion.ts` — [{"after":[3,3]},{"after":[12,12]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/contracts.ts` — [{"after":[118,119]},{"after":[152,152]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/history.ts` — [{"after":[6,6]},{"after":[18,18]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/publication.ts` — [{"after":[3,3]},{"after":[33,33]},{"after":[40,40]},{"after":[45,45]},{"after":[84,84]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/record.ts` — [{"after":[5,5]},{"after":[10,11]},{"after":[20,20]},{"after":[40,40]},{"after":[46,46]},{"after":[48,48]},{"after":[66,76]},{"after":[90,90]},{"after":[127,127]},{"after":[130,130]}]
- `c4a74c15e10ef4da16a79a625e52f7db8e9d2798:src/workflow/code-review/task-review/summary.ts` — [{"after":[7,13]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[1,8]},{"after":[10,18]},{"after":[20,27]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-fixture.ts` — [{"after":[1,57]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/helpers/review-production-native.ts` — [{"after":[1,1]},{"after":[3,10]},{"after":[12,23]},{"after":[25,40]},{"after":[42,43]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-worker-isolation.test.ts` — [{"after":[1,2]},{"after":[4,83]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[4,4]},{"after":[16,47]},{"after":[49,107]},{"after":[109,134]}]
- `41fce93268860d86ada33e24525241573aa32e7b:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[82,85]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[33,33]},{"after":[41,41]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[26,26]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-fixture.ts` — [{"after":[40,40]},{"after":[44,44]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-native.ts` — [{"after":[2,2]},{"after":[11,12]},{"after":[24,30]},{"deletionAt":31},{"after":[48,53]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-daemon.test.ts` — [{"after":[1,140]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-isolation.test.ts` — [{"after":[3,3]},{"after":[84,115]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/review-worker-recovery.test.ts` — [{"after":[3,3]},{"after":[48,48]},{"after":[55,58]},{"after":[63,78]},{"after":[101,103]},{"after":[131,131]},{"after":[141,141]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/review-worker-runtime.ts` — [{"after":[183,183]}]
- `8fe4b316c850a6e25999e81f683a66818a838290:src/workflow/review/design-review/worker-admission.ts` — [{"after":[27,27]},{"after":[68,73]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:docs/daemon.md` — [{"after":[1945,2012]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:docs/workflow.md` — [{"after":[20,37]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/review-native-policy.ts` — [{"after":[24,24]},{"after":[81,81]},{"after":[92,92]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/review-service.ts` — [{"after":[55,55]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` — [{"after":[25,25]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[9,9]},{"after":[14,14]},{"after":[24,26]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/helpers/review-worker-rpc.ts` — [{"after":[1,9]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/daemon/threads/__tests__/review-worker-package.test.ts` — [{"after":[1,75]}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` — [{"after":[4,4]},{"after":[7,9]},{"after":[22,22]},{"after":[29,29]},{"after":[38,39]},{"deletionAt":67}]
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/workflow/code-review/task-review/__tests__/controller-fixture.ts` — [{"after":[4,4]},{"after":[75,76]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/agent/providers/__tests__/helpers/review-process-worker.mjs` — [{"after":[24,24]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/agent/providers/__tests__/review-worker-process.test.ts` — [{"after":[10,10]},{"after":[19,19]},{"after":[22,22]},{"after":[32,32]},{"after":[46,46]},{"after":[48,49]},{"after":[115,138]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/__tests__/review-native-policy.test.ts` — [{"after":[44,44]},{"after":[57,63]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/__tests__/review-worker-routing.test.ts` — [{"after":[166,190]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/review-native-policy.ts` — [{"after":[92,95]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` — [{"after":[129,131]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/__tests__/review-worker-cleanup.test.ts` — [{"after":[4,4]},{"after":[88,96]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/__tests__/review-worker-publication.test.ts` — [{"after":[38,49]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/__tests__/review-workers.test.ts` — [{"after":[113,120]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/review-cleanup-discovery.ts` — [{"after":[21,21]},{"after":[45,46]},{"after":[50,50]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/review-worker-admission.ts` — [{"after":[33,33]},{"after":[46,48]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/review-worker-runtime.ts` — [{"after":[82,82]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/threads/review-workers.ts` — [{"after":[78,80]},{"after":[129,133]},{"after":[138,138]},{"after":[171,171]},{"after":[231,240]},{"after":[255,255]},{"after":[270,272]},{"after":[274,275]},{"after":[285,291]},{"after":[358,358]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/daemon/tools/review-shell-process.ts` — [{"after":[14,14]},{"after":[26,26]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/shared/vibe-session.ts` — [{"after":[102,102]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[75,109]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/workflow/code-review/task-review/capacity.ts` — [{"after":[14,15]},{"after":[85,85]},{"after":[89,90]},{"after":[96,96]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/workflow/code-review/task-review/publication.ts` — [{"after":[126,130]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/workflow/code-review/task-review/record.ts` — [{"after":[42,42]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/workflow/review/design-review/__tests__/worker-admission.test.ts` — [{"after":[33,33]},{"after":[49,52]},{"after":[115,143]}]
- `cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9:src/workflow/review/design-review/worker-admission.ts` — [{"after":[28,28]},{"after":[76,76]},{"after":[99,99]},{"after":[131,131]}]
- `8ebc81c96f18e0dbc16e87eacfbee44bb8f8bf2c:src/workflow/code-review/task-review/__tests__/admission-history.test.ts` — [{"after":[60,61]}]
- `8ebc81c96f18e0dbc16e87eacfbee44bb8f8bf2c:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` — [{"after":[26,26]}]
- `8ebc81c96f18e0dbc16e87eacfbee44bb8f8bf2c:src/workflow/code-review/task-review/completion.ts` — [{"after":[4,4]},{"after":[26,27]}]
- `f05b5d891ec873cb9517bfdc86ae57a0f332b76f:src/daemon/threads/__tests__/helpers/review-terminal-drain.ts` — [{"after":[1,11]}]
- `f05b5d891ec873cb9517bfdc86ae57a0f332b76f:src/daemon/threads/__tests__/review-worker-publication.test.ts` — [{"after":[50,68]}]
- `f05b5d891ec873cb9517bfdc86ae57a0f332b76f:src/daemon/threads/review-workers.ts` — [{"after":[292,300]},{"after":[302,302]}]
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-daemon.ts` — [{"after":[20,23]},{"after":[30,30]}]

### Verified final scope: ef85c2d168518ff9ec115611f9f119798fe69e70

Projection: 8d9fbbae156e7f048abc0383553155549459cc943362b323c432bf9d99cc8356 · attribution: accepted

- `src/shared/__tests__/review-resources.test.ts` (ba4d3cd9f852aa1c2826449c5da9f4a321c508d5) — selected: [{"after":[1,34]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[1,4]},{"after":[6,17]},{"after":[22,36]},{"after":[45,59]}]
- `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` (e8465a9b0a22982d930e68e7b5f8a74bc3e986d7) — selected: [{"after":[1,42]},{"after":[44,84]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[1,45]},{"after":[47,66]},{"after":[68,70]}]
- `src/workflow/code-review/task-review/checkpoint.ts` (177b09b5d011cc7d8ee8aa97dfd79de696ee32d1) — selected: [{"after":[9,10]},{"after":[37,40]},{"after":[47,48]},{"after":[89,95]},{"after":[102,102]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[11,12]},{"after":[107,108]},{"after":[135,151]},{"after":[153,153]},{"after":[155,168]}]
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` (22569da31a6932b316ec3687e924cc59b9ac1a15) — selected: [{"after":[1,22]},{"after":[27,49]}]
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` (a38801b5a783f19a054240b98c64cad51907faa7) — selected: [{"after":[6,7]},{"after":[9,9]},{"after":[51,102]},{"after":[131,131]}]
- `src/workflow/review/design-review/__tests__/fixtures.ts` (3b5678883835fed1f3793f432e547f802da60a77) — selected: [{"after":[9,9]},{"after":[22,31]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[1,2]},{"after":[5,6]},{"after":[9,18]},{"after":[20,21]},{"after":[29,39]},{"after":[48,51]},{"after":[54,54]},{"after":[63,64]},{"after":[66,71]},{"after":[74,77]},{"after":[89,90]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[11,12]},{"after":[14,14]},{"after":[144,149]},{"after":[163,164]},{"after":[183,189]},{"after":[202,203]},{"after":[207,208]},{"after":[209,209]},{"after":[212,217]},{"after":[220,220]},{"after":[222,223]},{"after":[225,227]},{"after":[231,231]},{"after":[239,242]},{"after":[244,244]},{"after":[246,248]},{"after":[250,250]},{"after":[252,261]},{"after":[262,262]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[6,6]},{"after":[220,226]},{"after":[230,235]},{"after":[237,240]},{"after":[243,257]}]
- `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` (22569da31a6932b316ec3687e924cc59b9ac1a15) — selected: [{"after":[23,26]}]
- `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` (a38801b5a783f19a054240b98c64cad51907faa7) — selected: [{"after":[103,130]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[22,28]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[169,172]},{"after":[228,228]},{"after":[232,238]},{"after":[245,245]},{"after":[249,249]},{"deletionAt":261}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[227,229]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (3b8fea77936c83c24a716c2829ca4c178b242068) — selected: [{"after":[1,12]},{"after":[14,32]},{"after":[36,59]},{"after":[62,76]}]
- `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` (69ccabd20996ecd9aebc5281e329c7991baeed94) — selected: [{"after":[1,38]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[67,67]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[83,83]}]
- `src/workflow/code-review/task-review/completion.ts` (60d24198033bf4e86862fbbf23e368f5ad240efd) — selected: [{"after":[11,11]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[109,109]},{"after":[126,127]},{"after":[154,154]}]
- `src/workflow/code-review/task-review/history.ts` (1883eee5e020e4ddb5c3c11d6bab44b1a676dfad) — selected: [{"after":[1,5]},{"after":[7,17]},{"after":[19,21]}]
- `src/workflow/code-review/task-review/publication.ts` (240f7db668deb81fff7acefb36a63640be7e75f7) — selected: [{"after":[10,13]},{"after":[18,19]},{"after":[24,24]},{"after":[29,32]},{"after":[34,36]},{"after":[38,38]},{"after":[71,71]},{"after":[79,79]},{"after":[82,83]},{"after":[85,85]},{"after":[102,106]},{"after":[114,125]},{"after":[131,139]}]
- `src/workflow/code-review/task-review/record.ts` (b534e852bfbd821043dbfb81f7e499e5d8e10a23) — selected: [{"after":[6,8]},{"after":[24,28]},{"after":[43,45]},{"after":[47,47]},{"after":[49,49]},{"after":[53,53]},{"after":[55,60]},{"after":[93,93]},{"after":[99,99]},{"after":[104,104]},{"after":[110,123]},{"after":[128,128]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[1,3]},{"after":[5,8]},{"after":[10,16]},{"after":[18,26]},{"after":[31,79]},{"after":[103,103]},{"after":[110,111]},{"after":[113,117]},{"after":[122,122]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[55,56]},{"after":[58,58]},{"after":[61,62]},{"after":[65,65]}]
- `src/workflow/review/design-review/approval.ts` (9e8b463ddb593db36210e27c13a2cb2324429795) — selected: [{"after":[14,15]},{"after":[18,20]},{"after":[22,22]},{"after":[27,32]},{"after":[36,59]},{"after":[91,92]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[65,66]},{"after":[68,68]},{"after":[114,114]},{"after":[121,122]},{"after":[204,206]},{"after":[210,211]},{"after":[218,219]},{"after":[221,221]},{"after":[224,224]},{"deletionAt":208}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[241,242]}]
- `src/workflow/review/design-review/history.ts` (81342069bcc4ea3cf0fe655f61c1f73bbb4d7e17) — selected: [{"after":[6,6]},{"after":[8,11]},{"after":[18,18]},{"after":[33,39]},{"after":[41,45]},{"after":[50,54]},{"after":[64,66]},{"after":[68,68]},{"after":[85,85]},{"after":[102,102]}]
- `src/workflow/review/design-review/provenance.ts` (2a926f45f054b1de40ba6d84d9a3712d6b692826) — selected: [{"after":[8,8]},{"after":[14,14]},{"after":[28,28]},{"after":[34,34]}]
- `src/workflow/review/design-review/publication.ts` (db4fee1b9b4ae25269e3bf39e76d1330e335afd8) — selected: [{"after":[12,12]},{"after":[15,17]},{"after":[33,37]},{"after":[52,54]},{"after":[57,58]},{"after":[95,97]},{"after":[101,105]}]
- `src/workflow/review/design-review/read.ts` (301c659f093cfe78bf64ce904e64c6ba2fd09a80) — selected: [{"after":[5,5]},{"after":[7,8]},{"after":[11,15]},{"after":[27,31]},{"after":[35,35]},{"after":[37,37]},{"after":[41,41]},{"after":[43,43]}]
- `src/workflow/review/design-review/results.ts` (0e26ac74834bebbcf77d6f7261685553886f798f) — selected: [{"after":[16,16]},{"after":[20,20]},{"after":[138,138]},{"after":[155,155]}]
- `src/workflow/review/report-log.ts` (f883d20ef1f2b2dfa3bce914e882da3cb0e7f7bd) — selected: [{"after":[111,111]}]
- `src/workflow/review/resource-audit.ts` (9171da87ed66c2cc436d4aa8b88e6f33f4a55ee9) — selected: [{"after":[1,55]}]
- `src/workflow/artifact-core/codecs.ts` (69e5943d38feb99c3b5e241ced04b1ac8a1cf06e) — selected: [{"after":[103,103]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (3b8fea77936c83c24a716c2829ca4c178b242068) — selected: [{"after":[13,13]},{"after":[33,35]}]
- `src/workflow/code-review/task-review/coordinator.ts` (f3bddfa6764e7e58f0f9b1f7de17d84597993414) — selected: [{"after":[16,16]},{"after":[20,20]},{"after":[116,116]},{"after":[119,121]}]
- `src/workflow/code-review/task-review/progress-view.ts` (a4bf1a6b3ba751064ce7ed6f280db197d270cc89) — selected: [{"after":[9,9]},{"after":[16,16]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[9,9]},{"after":[17,17]},{"after":[27,30]},{"after":[80,81]},{"after":[83,84]},{"after":[89,102]},{"after":[104,109]},{"after":[118,121]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[162,162]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[16,18]},{"after":[266,266]},{"after":[269,269]},{"after":[274,281]},{"deletionAt":31}]
- `src/workflow/review/design-review/progress.ts` (292c1d04ea6a286cb5855d2a082df7f53fd81ee9) — selected: [{"after":[4,6]},{"after":[79,93]}]
- `src/workflow/review/design-review/publication.ts` (db4fee1b9b4ae25269e3bf39e76d1330e335afd8) — selected: [{"after":[7,7]},{"after":[11,11]},{"after":[18,18]},{"after":[21,28]},{"after":[63,63]},{"after":[69,88]},{"after":[90,90]},{"after":[122,123]},{"after":[126,126]}]
- `src/daemon/threads/__tests__/review-processes.test.ts` (8d4133bdeaa1ca486853e5f32aa4fdd4a869340b) — selected: [{"after":[1,154]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[1,12]},{"after":[14,14]},{"after":[17,105]},{"after":[107,109]},{"after":[111,145]},{"after":[148,176]},{"after":[178,179]},{"after":[184,213]},{"after":[221,227]}]
- `src/daemon/tools/shell-helper.ts` (18a95b659fb28492d774a98e9151e27e4d609fea) — selected: [{"after":[18,19]},{"after":[85,86]},{"after":[89,89]},{"after":[113,113]},{"after":[147,147]},{"after":[151,151]},{"after":[160,160]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[23,23]},{"after":[25,26]},{"after":[28,47]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (8c2a7c60e4e4976a61296f72f587e957c1c2d622) — selected: [{"after":[1,4]},{"after":[6,9]},{"after":[11,18]},{"after":[20,21]},{"after":[23,31]},{"after":[33,33]},{"after":[36,45]},{"after":[76,95]},{"after":[103,110]},{"after":[138,138]}]
- `src/agent/providers/cli-provider.ts` (e2994fe20dae211b59260ebac9ad0d54fd37dae9) — selected: [{"after":[71,71]},{"after":[1259,1261]},{"after":[1290,1290]},{"after":[1293,1293]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[15,16]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[24,24]},{"after":[104,105]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[1,23]},{"after":[26,37]},{"after":[39,43]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[1,3]},{"after":[5,15]},{"after":[18,20]},{"after":[22,24]},{"after":[34,72]},{"after":[74,80]}]
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` (66d1677dda02e2d36252437a673ecad41206659e) — selected: [{"after":[1,3]},{"after":[6,20]},{"after":[22,23]},{"after":[25,34]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (8c2a7c60e4e4976a61296f72f587e957c1c2d622) — selected: [{"after":[5,5]},{"after":[50,62]},{"after":[64,76]},{"after":[96,102]},{"after":[111,113]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[4,4]},{"after":[27,33]}]
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` (66d1677dda02e2d36252437a673ecad41206659e) — selected: [{"after":[4,5]},{"after":[21,21]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (8c2a7c60e4e4976a61296f72f587e957c1c2d622) — selected: [{"after":[34,35]},{"after":[63,63]}]
- `src/daemon/threads/__tests__/helpers/review-shell-host.ts` (7e459443a9ec2ea2103e18a2b5dda59018a2f139) — selected: [{"after":[1,5]},{"after":[9,9]},{"after":[12,14]},{"after":[16,17]},{"after":[25,26]},{"after":[31,31]},{"after":[40,41]},{"after":[43,45]},{"after":[47,49]},{"after":[51,58]},{"after":[60,60]}]
- `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` (7632e575bb4d1b0176464582c026edd1cd049fcb) — selected: [{"after":[1,21]},{"after":[23,24]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[13,13]},{"after":[110,110]},{"after":[146,147]},{"after":[180,183]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[1,8]},{"after":[10,11]},{"after":[13,15]},{"after":[17,30]},{"after":[47,51]},{"after":[67,81]},{"after":[83,85]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[1,6]},{"after":[10,21]},{"after":[23,24]},{"after":[35,35]}]
- `src/daemon/tools/review-shell-process.ts` (31b334230156e974e7a3ee6d4853ecdb545a516c) — selected: [{"after":[1,4]},{"after":[7,13]},{"after":[16,25]},{"after":[27,65]},{"after":[67,76]}]
- `src/daemon/tools/shell-helper.ts` (18a95b659fb28492d774a98e9151e27e4d609fea) — selected: [{"after":[20,21]},{"after":[103,104]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[1,15]},{"after":[17,23]},{"after":[25,29]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[38,38]}]
- `src/shared/review-process-bridge.ts` (261fb3a10bc58651215a55dd17a820b2128fc09d) — selected: [{"after":[16,17]},{"after":[21,21]},{"after":[25,26]},{"after":[73,73]}]
- `src/daemon/threads/__tests__/helpers/review-shell-host.ts` (7e459443a9ec2ea2103e18a2b5dda59018a2f139) — selected: [{"after":[6,8]},{"after":[10,11]},{"after":[15,15]},{"after":[18,24]},{"after":[27,30]},{"after":[32,39]},{"after":[42,42]},{"after":[46,46]},{"after":[50,50]},{"after":[59,59]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[9,9]},{"after":[12,12]},{"after":[16,16]},{"after":[37,37]},{"after":[42,46]},{"after":[52,66]},{"after":[82,82]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[7,9]},{"after":[22,22]},{"after":[25,31]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[177,177]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[38,41]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[32,33]}]
- `src/daemon/tools/review-shell-process.ts` (31b334230156e974e7a3ee6d4853ecdb545a516c) — selected: [{"after":[66,66]}]
- `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` (7632e575bb4d1b0176464582c026edd1cd049fcb) — selected: [{"after":[22,22]}]
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` (8a7e8b3b9c26c82f2e785756b487685c438a57e3) — selected: [{"after":[31,36]}]
- `src/daemon/tools/__tests__/review-worker-shell.test.ts` (4866d74a0bf574f03e190d451884103cc46ca148) — selected: [{"after":[34,34]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[16,16]}]
- `src/shared/vibe-session.ts` (2a52eca9f523bdc3d2a5f62cf04daafa840aacee) — selected: [{"after":[7,9]},{"after":[99,101]},{"after":[103,104]},{"after":[225,225]},{"after":[227,231]}]
- `src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts` (08bcab0aedf5328b2946842d177f5956b73d7871) — selected: [{"after":[1,11]}]
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` (4db9bd6f2c3e797207129b4743102ff0a2c8eb43) — selected: [{"after":[1,3]},{"after":[5,10]},{"after":[12,19]},{"after":[22,32]},{"after":[58,58]},{"after":[63,64]},{"after":[66,73]},{"after":[79,92]},{"after":[94,99]},{"after":[101,102]},{"after":[104,105]},{"after":[107,110]},{"after":[112,113]},{"after":[115,128]},{"after":[132,134]}]
- `src/daemon/threads/review-worker-admission.ts` (0e27edb4b3c55de4c26f5f0c3666b576325ed5e6) — selected: [{"after":[1,4]},{"after":[6,10]},{"after":[12,18]},{"after":[31,31]},{"after":[34,35]},{"after":[37,38]},{"after":[40,40]},{"after":[42,42]},{"after":[51,54]},{"after":[56,60]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[1,6]},{"after":[8,12]},{"after":[14,17]},{"after":[19,19]},{"after":[35,36]},{"after":[38,40]},{"after":[42,43]},{"after":[46,48]},{"after":[50,54]},{"after":[56,67]},{"after":[69,77]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[1,15]},{"after":[24,29]},{"after":[31,36]}]
- `src/daemon/threads/review-worker-native.ts` (6522ffb1ece3f25a8996b2355178fe86fda274b7) — selected: [{"after":[1,15]},{"after":[17,35]},{"after":[37,47]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[1,1]},{"after":[6,13]},{"after":[15,18]},{"after":[19,26]},{"after":[46,48]},{"after":[50,51]},{"after":[57,61]},{"after":[63,63]},{"after":[92,95]},{"after":[200,202]},{"after":[204,205]},{"after":[224,226]},{"after":[237,238]}]
- `src/daemon/threads/review-worker.ts` (f3d68bfc913a29e31351b9fe263dde7ea55271cc) — selected: [{"after":[1,7]},{"after":[10,11]}]
- `src/daemon/threads/workers.ts` (87dfb69b71b139ade3ea5dc0a8c718124baa1954) — selected: [{"after":[74,79]},{"after":[81,84]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[7,7]},{"after":[80,80]}]
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` (4db9bd6f2c3e797207129b4743102ff0a2c8eb43) — selected: [{"after":[4,4]},{"after":[11,11]},{"after":[20,21]},{"after":[33,57]},{"after":[59,62]},{"after":[65,65]},{"after":[74,78]},{"after":[93,93]},{"after":[100,100]},{"after":[103,103]},{"after":[106,106]},{"after":[111,111]},{"after":[114,114]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[7,7]},{"after":[13,13]},{"after":[20,34]},{"after":[37,37]},{"after":[41,41]},{"after":[44,45]},{"after":[49,49]},{"after":[55,55]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[4,5]},{"after":[14,14]},{"after":[96,96]},{"after":[206,217]},{"after":[222,223]}]
- `src/daemon/threads/review-worker.ts` (f3d68bfc913a29e31351b9fe263dde7ea55271cc) — selected: [{"after":[8,9]}]
- `src/shared/review-native-guard.ts` (5b647c677d75dddb813bb518045478b66a417dee) — selected: [{"after":[24,24]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (811d93e63b47cde2344058487c7ebd94cdf9e0a2) — selected: [{"after":[1,2]},{"after":[4,13]},{"after":[16,32]},{"after":[35,37]},{"after":[40,60]},{"after":[62,64]},{"after":[66,75]},{"after":[77,81]},{"after":[86,90]},{"after":[92,93]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[1,35]},{"after":[39,72]},{"after":[74,83]},{"after":[87,112]},{"after":[117,119]},{"after":[121,127]},{"after":[137,137]}]
- `src/daemon/threads/review-worker-bootstrap.ts` (972cf457bdd84e954706ba792b8dc7d753ae7edb) — selected: [{"after":[18,18]},{"after":[68,68]}]
- `src/daemon/threads/review-worker-native.ts` (6522ffb1ece3f25a8996b2355178fe86fda274b7) — selected: [{"after":[16,16]},{"after":[36,36]}]
- `src/daemon/threads/review-worker-resources.ts` (5e64127ff404b3f0d4a9fb7b03b2821690be8045) — selected: [{"after":[1,6]},{"after":[9,19]},{"after":[21,32]},{"after":[34,36]},{"after":[38,39]},{"after":[41,41]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[27,29]},{"after":[198,199]},{"after":[218,221]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[1,17]},{"after":[32,37]},{"after":[39,41]},{"after":[44,52]},{"after":[54,56]},{"after":[59,62]},{"after":[65,76]},{"after":[81,81]},{"after":[83,90]},{"after":[93,93]},{"after":[97,99]},{"after":[101,102]},{"after":[104,110]},{"after":[117,118]},{"after":[120,121]},{"after":[125,125]},{"after":[127,128]},{"after":[156,156]},{"after":[159,170]},{"after":[172,179]},{"after":[181,181]},{"after":[183,183]},{"after":[185,187]},{"after":[189,206]},{"after":[258,260]},{"after":[262,262]},{"after":[279,281]},{"after":[283,283]},{"after":[301,301]},{"after":[303,305]},{"after":[307,308]},{"after":[391,394]},{"after":[401,406]},{"after":[408,410]},{"after":[420,420]}]
- `src/daemon/threads/status-board.ts` (a120cfa7414773b3cf12e25269e9b8ac0b62b287) — selected: [{"after":[26,26]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[44,49]}]
- `src/shared/types.ts` (aeef8d881c29690e9fb152167246db81596fe6b0) — selected: [{"after":[1242,1242]},{"after":[1250,1250]}]
- `src/workflow/code-review/task-review/checkpoint.ts` (177b09b5d011cc7d8ee8aa97dfd79de696ee32d1) — selected: [{"after":[26,30]},{"after":[36,36]},{"after":[41,46]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[7,7]},{"after":[40,41]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (811d93e63b47cde2344058487c7ebd94cdf9e0a2) — selected: [{"after":[3,3]},{"after":[33,34]},{"after":[38,39]},{"after":[61,61]},{"after":[65,65]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[62,62]},{"after":[169,169]},{"after":[171,171]},{"after":[173,173]},{"after":[175,175]},{"after":[177,183]},{"after":[185,186]},{"after":[197,197]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[57,58]},{"after":[264,266]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (811d93e63b47cde2344058487c7ebd94cdf9e0a2) — selected: [{"after":[14,15]},{"after":[94,112]}]
- `src/daemon/threads/review-worker-admission.ts` (0e27edb4b3c55de4c26f5f0c3666b576325ed5e6) — selected: [{"after":[5,5]},{"after":[19,21]},{"after":[36,36]},{"after":[39,39]},{"after":[41,41]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[16,17]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[30,33]},{"after":[138,138]},{"after":[147,147]},{"after":[149,150]},{"after":[155,155]},{"after":[158,159]},{"after":[167,168]},{"after":[189,189]},{"after":[192,197]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[38,38]},{"after":[124,124]},{"after":[137,137]},{"after":[141,144]},{"after":[246,247]},{"after":[249,250]},{"after":[258,258]}]
- `src/workflow/code-review/task-review/__tests__/admission.test.ts` (6bc57be2ba5c5c6516dc32dd50a0c5d71cb485fe) — selected: [{"after":[12,12]},{"after":[49,49]},{"after":[111,111]}]
- `src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` (4ff1c665d9b9eb017ba6b6bda7dee582ffd8a0e2) — selected: [{"after":[1,15]},{"after":[17,30]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[1,75]},{"after":[79,84]},{"after":[89,89]},{"after":[99,100]},{"after":[102,102]},{"after":[115,118]},{"after":[120,125]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[10,10]},{"after":[29,36]},{"after":[38,38]},{"after":[46,50]},{"after":[55,55]},{"after":[107,107]},{"after":[114,114]}]
- `src/workflow/code-review/task-review/controller.ts` (ac14aaa784ccca3453ca230583ad0889439efda5) — selected: [{"after":[57,57]}]
- `src/workflow/code-review/task-review/coordinator.ts` (f3bddfa6764e7e58f0f9b1f7de17d84597993414) — selected: [{"after":[37,37]},{"after":[69,69]},{"after":[136,136]},{"after":[147,147]},{"after":[150,150]},{"after":[184,184]}]
- `src/workflow/code-review/task-review/progress.ts` (487cc87ba0fc25662f66b97663666382611de1ea) — selected: [{"after":[25,25]},{"after":[29,33]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[1,19]},{"after":[22,28]},{"after":[34,38]},{"after":[42,54]},{"after":[63,78]}]
- `src/workflow/code-review/task-review/worker-checkpoint.ts` (4aa9b1d075c01474bbe7e69beecc8eaa42f2c22c) — selected: [{"after":[1,6]},{"after":[8,46]},{"after":[51,61]}]
- `src/daemon/threads/review-worker-admission.ts` (0e27edb4b3c55de4c26f5f0c3666b576325ed5e6) — selected: [{"after":[22,24]},{"after":[26,26]},{"after":[27,30]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[18,18]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[119,119]},{"after":[248,248]},{"after":[252,253]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[85,85]},{"after":[90,98]},{"after":[101,101]},{"after":[103,114]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[29,33]},{"after":[55,58]},{"after":[60,62]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[21,21]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[34,35]},{"after":[49,49]},{"after":[78,78]},{"after":[157,157]},{"after":[161,162]},{"after":[203,203]},{"deletionAt":18}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[112,112]}]
- `src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` (eda17a50675f038025efc7de7ebed675eb070318) — selected: [{"after":[1,8]},{"after":[10,13]},{"after":[20,35]}]
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` (e05962aa4d8ac01aa44d796b9e7a37b391ee0792) — selected: [{"after":[1,2]},{"after":[4,14]},{"after":[16,29]},{"after":[32,32]},{"after":[35,35]},{"after":[37,48]},{"after":[53,54]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[48,49]},{"after":[99,99]},{"after":[224,224]},{"after":[226,226]},{"after":[248,248]},{"after":[257,257]},{"after":[284,284]},{"after":[286,286]}]
- `src/workflow/review/design-review/worker-admission.ts` (3f1626e0b04007f18a21ac5e45f2d9eb40fe54c4) — selected: [{"after":[1,5]},{"after":[7,11]},{"after":[14,22]},{"after":[29,30]},{"after":[33,42]},{"after":[46,48]},{"after":[51,53]},{"after":[55,56]},{"after":[64,65]},{"after":[101,111]},{"after":[113,130]},{"after":[136,137]}]
- `src/workflow/review/design-review/worker-checkpoint.ts` (3ca9672ab3359ff987128bb2803506f30c56c921) — selected: [{"after":[1,5]},{"after":[7,19]},{"after":[23,30]},{"after":[35,36]},{"after":[39,41]}]
- `src/daemon/threads/review-worker-admission.ts` (0e27edb4b3c55de4c26f5f0c3666b576325ed5e6) — selected: [{"after":[11,11]},{"after":[43,45]},{"after":[49,50]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[37,37]},{"after":[139,141]},{"after":[144,146]},{"after":[151,152]},{"after":[154,154]},{"after":[163,163]},{"after":[165,166]},{"after":[172,172]},{"after":[174,174]},{"after":[187,187]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[18,18]},{"after":[64,64]},{"after":[139,140]},{"after":[225,228]},{"after":[230,230]},{"after":[241,244]},{"after":[254,254]},{"after":[256,257]},{"after":[261,261]},{"after":[282,282]}]
- `src/workflow/review/design-review/__tests__/action-admission.test.ts` (7f68642d753288690949c0af2063988e31b8aad5) — selected: [{"after":[1,41]}]
- `src/workflow/review/design-review/__tests__/helpers/worker-admission.ts` (eda17a50675f038025efc7de7ebed675eb070318) — selected: [{"after":[9,9]},{"after":[14,19]}]
- `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` (22cec41c3292d63c0fa6b54d402f79f185f85b41) — selected: [{"after":[88,88]}]
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` (e05962aa4d8ac01aa44d796b9e7a37b391ee0792) — selected: [{"after":[3,3]},{"after":[15,15]},{"after":[30,31]},{"after":[34,34]},{"after":[36,36]},{"after":[55,114]}]
- `src/workflow/review/design-review/action-admission.ts` (ab6ad1ec6ce494d3fff4773b1a185d374593b169) — selected: [{"after":[1,15]},{"after":[17,22]},{"after":[24,44]}]
- `src/workflow/review/design-review/action-state.ts` (5b18865714599352759cb1de66bc1fbe3141d806) — selected: [{"after":[1,13]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[8,8]},{"after":[19,19]},{"after":[52,53]},{"after":[57,57]},{"after":[59,60]},{"after":[78,87]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[15,15]},{"after":[35,35]},{"after":[46,46]},{"after":[59,59]},{"after":[78,78]},{"after":[128,128]}]
- `src/workflow/review/design-review/contracts.ts` (792c7c851b7a7985b9d566cfb55663436c26011b) — selected: [{"after":[70,71]},{"after":[236,236]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[34,34]},{"after":[158,158]},{"after":[200,200]},{"after":[218,218]},{"deletionAt":6}]
- `src/workflow/review/design-review/recovery-state.ts` (c6c73c31a78f33f803e49683de5a373f4cab6e39) — selected: [{"after":[5,5]},{"after":[55,55]}]
- `src/workflow/review/design-review/request-signature.ts` (88db8da028054a4db14811be462597320df07dfa) — selected: [{"after":[1,6]}]
- `src/workflow/review/design-review/worker-admission.ts` (3f1626e0b04007f18a21ac5e45f2d9eb40fe54c4) — selected: [{"after":[12,13]},{"after":[23,25]},{"after":[31,31]},{"after":[43,45]},{"after":[49,50]},{"after":[54,54]},{"after":[66,68]},{"after":[75,75]},{"after":[77,98]},{"after":[100,100]},{"after":[112,112]},{"after":[132,133]},{"after":[135,135]}]
- `src/workflow/review/design-review/worker-checkpoint.ts` (3ca9672ab3359ff987128bb2803506f30c56c921) — selected: [{"after":[6,6]},{"after":[20,22]},{"after":[31,34]},{"after":[37,38]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[1,24]},{"after":[26,26]},{"after":[28,34]},{"after":[36,49]},{"after":[51,51]},{"after":[54,57]},{"after":[60,60]},{"after":[63,63]}]
- `src/daemon/threads/__tests__/helpers/review-crash-daemon.ts` (bbdf678ad54802ac19da69b456603bdc11476fae) — selected: [{"after":[1,13]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[1,22]},{"after":[25,82]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[1,2]},{"after":[5,8]},{"after":[199,227]},{"after":[231,231]},{"after":[233,255]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[129,135]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[214,220]}]
- `src/daemon/threads/review-resource-recovery.ts` (d91b01775a31f8d1b7c210089dd013f0ddff6ebd) — selected: [{"after":[1,20]},{"after":[24,26]},{"after":[28,29]},{"after":[31,43]},{"after":[45,46]},{"after":[48,70]},{"after":[72,72]},{"after":[74,77]},{"after":[79,89]},{"after":[91,92]},{"after":[94,95]}]
- `src/daemon/threads/review-resource-worker.ts` (6d142cc4e16267935989b0c312d5f58dd812e241) — selected: [{"after":[1,22]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[39,39]},{"after":[227,227]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[19,20]},{"after":[25,25]},{"after":[82,82]},{"after":[92,92]},{"after":[122,122]},{"after":[306,306]},{"after":[375,375]},{"after":[377,377]},{"after":[380,390]},{"after":[407,407]}]
- `src/shared/process-group.ts` (2dadeec5edb5e5e4d6fdee5bfe118fa9f049ec79) — selected: [{"after":[27,27]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[5,5]},{"after":[37,44]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[3,4]},{"after":[42,47]},{"after":[72,73]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[13,13]},{"after":[243,243]},{"after":[251,251]}]
- `src/workflow/review/resource-recovery.ts` (08381389a423f9bb2eb65be1c70e6ab719e7d4fa) — selected: [{"after":[1,24]},{"after":[26,27]},{"after":[29,64]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[23,24]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[228,230]},{"after":[232,232]}]
- `src/daemon/threads/review-worker-admission.ts` (0e27edb4b3c55de4c26f5f0c3666b576325ed5e6) — selected: [{"after":[32,32]},{"after":[55,55]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[160,160]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[50,50]},{"after":[52,53]}]
- `src/daemon/threads/__tests__/review-worker-clearance.test.ts` (3e5a72f858d3d5bb72dc75398d9f8d3c4f1032e0) — selected: [{"after":[83,110]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[61,62]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[230,231]},{"after":[234,234]},{"after":[242,242]}]
- `jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` (ca1e19e42e925efdbadb3a55eaf38f6042d4ad2e) — selected: [{"after":[1,30]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` (c47b8e0a3353032e9eca7d7882b8dc7918a675de) — selected: [{"after":[80,80]},{"after":[1892,1892]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt` (665a63907432bc5c3bfb72f86c6d5594583680e2) — selected: [{"after":[1,37]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt` (996fb1ecbb06845abebf2a162c69439f627fba8b) — selected: [{"after":[58,58]},{"after":[63,63]},{"after":[204,210]},{"after":[216,218]},{"after":[227,228]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt` (2112db8048a8c965f5a5e8195e315acb89063673) — selected: [{"after":[148,149]},{"after":[162,171]},{"after":[210,210]}]
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt` (ee71c07947928fb2e3ef8a0e9b890d165364d027) — selected: [{"after":[1,21]}]
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt` (de0f52f7a1265eb43f8aa742d18ffd2bd1ef9807) — selected: [{"after":[1,25]}]
- `src/cli/panes/DaemonPane.tsx` (ca040df17f39ced9c5d1cc59be229a15204a1a01) — selected: [{"after":[12,12]},{"after":[116,116]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[58,59]},{"after":[61,62]}]
- `src/daemon/threads/__tests__/review-worker-progress.test.ts` (885709678b254c70cb79abc7bbf0ca51c0eea374) — selected: [{"after":[1,85]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (811d93e63b47cde2344058487c7ebd94cdf9e0a2) — selected: [{"after":[76,76]},{"after":[91,91]}]
- `src/daemon/threads/admin-status.ts` (db1badb68a2a7ddebd0c7a2572e9fcbe2faf6088) — selected: [{"after":[56,56]}]
- `src/daemon/threads/main-services.ts` (ce2d343e345cc636acbfe844a485c002d20124b3) — selected: [{"after":[17,17]},{"after":[175,175]}]
- `src/daemon/threads/review-progress.ts` (862c456aae7973aa63631810e07eed687666a154) — selected: [{"after":[1,29]},{"after":[31,38]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[30,30]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[2,3]},{"after":[38,38]},{"after":[80,81]},{"after":[83,84]},{"after":[89,91]},{"after":[153,153]},{"after":[164,164]},{"after":[235,236]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[21,24]},{"after":[53,53]},{"after":[182,182]},{"after":[184,184]},{"after":[188,188]},{"after":[207,210]},{"after":[268,269]},{"after":[273,273]},{"after":[276,279]},{"after":[284,284]}]
- `src/daemon/threads/status-board.ts` (a120cfa7414773b3cf12e25269e9b8ac0b62b287) — selected: [{"after":[14,14]},{"after":[23,24]},{"after":[177,177]},{"after":[195,195]},{"after":[210,210]},{"after":[230,230]}]
- `src/daemon/threads/worker-entry.ts` (27273dfe0a990724269155695bdacf9dc9ecdd1f) — selected: [{"after":[16,16]},{"after":[21,21]},{"after":[89,89]}]
- `src/shared/review-worker-progress.ts` (0f30b627868dbb3f1518891b2bd213c6fdc0fa5b) — selected: [{"after":[1,28]}]
- `src/shared/types.ts` (aeef8d881c29690e9fb152167246db81596fe6b0) — selected: [{"after":[1246,1246]}]
- `src/workflow/artifact-content.ts` (00b7b090dd74fa13f859aa433853bca0d8690912) — selected: [{"after":[1,1]},{"after":[60,60]},{"after":[239,239]},{"after":[244,244]}]
- `src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts` (4ff1c665d9b9eb017ba6b6bda7dee582ffd8a0e2) — selected: [{"after":[16,16]}]
- `src/workflow/review/design-review/worker-admission.ts` (3f1626e0b04007f18a21ac5e45f2d9eb40fe54c4) — selected: [{"after":[32,32]},{"after":[134,134]}]
- `src/workflow/review/worker-progress-source.ts` (b7f6536e5ace298c76362ebc72d9508ef957c224) — selected: [{"after":[1,10]}]
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` (474effbf47015be1a30a4861648176b8f8249024) — selected: [{"after":[1251,1255]},{"after":[1822,1822]},{"after":[1896,1896]},{"after":[1985,1985]},{"after":[7588,7599]}]
- `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` (93feb2befceff0c8445622c5996e96264317bdd4) — selected: [{"after":[1,20]}]
- `vscode-plugin/src/chat/docs-review-client.ts` (1b6550cbc2b5bc770c592d001457cad3c84dbd5c) — selected: [{"after":[36,36]},{"after":[191,191]}]
- `vscode-plugin/src/chat/docs-review-panel.ts` (1070f1e78c4e316589858e50022b00a480c4284b) — selected: [{"after":[1,1]},{"after":[107,108]},{"after":[1419,1427]},{"after":[1536,1536]},{"after":[1585,1585]},{"after":[1615,1615]},{"after":[2270,2270]},{"after":[2276,2276]},{"after":[2389,2389]},{"after":[2431,2431]}]
- `vscode-plugin/src/chat/protocol.ts` (096dd23f72d4434be70bf7a6e41f396d86c69d6c) — selected: [{"after":[157,157]},{"after":[175,176]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[76,78]},{"after":[87,88]}]
- `src/daemon/threads/__tests__/artifact-write-authority.test.ts` (a8fecc016757f4f09c2db2d79b147d28d47a4345) — selected: [{"after":[1,31]}]
- `src/daemon/threads/__tests__/helpers/artifact-writer.ts` (10a15b38abf08f372cc1c85c5157a21c4212e5d2) — selected: [{"after":[1,14]}]
- `src/daemon/threads/__tests__/helpers/review-maintenance.ts` (acc725cdb4f2cb9f35604c0689c06684b8dcb2a8) — selected: [{"after":[1,9]}]
- `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` (01a95fd086bc5910f00d6b2951e36e32be91edeb) — selected: [{"after":[1,3]},{"after":[5,87]},{"after":[97,99]}]
- `src/daemon/threads/__tests__/review-worker-publication.test.ts` (6171e0d272fab0297c481a249b9b7ce03f27293c) — selected: [{"after":[1,37]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[9,13]},{"after":[15,15]},{"after":[176,198]}]
- `src/daemon/threads/artifact-write-authority.ts` (9f2f96a4aa1d91f2e1b8a43030edd279db8f2d57) — selected: [{"after":[1,49]}]
- `src/daemon/threads/main-services.ts` (ce2d343e345cc636acbfe844a485c002d20124b3) — selected: [{"after":[18,20]},{"after":[159,162]},{"after":[176,176]},{"after":[179,179]},{"after":[217,217]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (6eed6c7ce1393aa311e1dc173d3d0ed0569008e5) — selected: [{"after":[1,20]},{"after":[22,23]},{"after":[38,42]},{"after":[56,56]},{"after":[58,64]},{"after":[66,76]}]
- `src/daemon/threads/review-progress.ts` (862c456aae7973aa63631810e07eed687666a154) — selected: [{"after":[30,30]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[19,20]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[36,36]},{"after":[40,44]},{"after":[66,76]},{"after":[79,79]},{"after":[85,88]},{"after":[106,117]},{"after":[119,129]},{"after":[132,137]},{"after":[156,156]},{"after":[170,170]},{"after":[228,234]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[26,31]},{"after":[63,63]},{"after":[77,77]},{"after":[91,91]},{"after":[94,96]},{"after":[103,103]},{"after":[113,116]},{"after":[126,126]},{"after":[134,135]},{"after":[157,157]},{"after":[180,180]},{"after":[212,225]},{"after":[229,229]},{"after":[251,251]},{"after":[263,263]},{"after":[309,333]},{"after":[340,362]},{"after":[365,374]},{"after":[379,379]},{"after":[411,419]}]
- `src/daemon/threads/worker-entry.ts` (27273dfe0a990724269155695bdacf9dc9ecdd1f) — selected: [{"after":[17,20]},{"after":[83,88]}]
- `src/daemon/threads/workers.ts` (87dfb69b71b139ade3ea5dc0a8c718124baa1954) — selected: [{"after":[86,86]},{"after":[88,92]}]
- `src/workflow/artifact-core/store.ts` (ce586c7452fb4caa21d5c135ac8154ee050dee08) — selected: [{"after":[15,15]},{"after":[258,258]}]
- `src/workflow/artifact-core/write-authority.ts` (015c6127477a7c3c75f688aa9a577d121cc683cd) — selected: [{"after":[1,10]}]
- `src/workflow/code-review/task-review/cleanup.ts` (534cc31c4201ee07464c7be9119b7334b8ab06b0) — selected: [{"after":[1,1]},{"after":[5,11]},{"after":[17,17]},{"after":[25,25]},{"after":[29,29]},{"after":[34,34]},{"after":[36,38]},{"after":[41,41]},{"after":[47,54]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[21,21]},{"after":[39,41]}]
- `src/workflow/review/cleanup-owner.ts` (24839b0ae47be63319881bafa8df3f49ebbeb318) — selected: [{"after":[1,11]}]
- `src/workflow/review/design-review/cleanup.ts` (b43d0375f863140d58003509d29181fdf708c65e) — selected: [{"after":[9,12]},{"after":[15,16]},{"after":[20,21]},{"after":[41,42]},{"after":[44,45]},{"after":[52,52]},{"after":[56,56]},{"after":[60,60]},{"after":[76,76]},{"after":[94,94]},{"after":[101,101]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[2,2]},{"after":[270,273]}]
- `src/workflow/review/design-review/worker-admission.ts` (3f1626e0b04007f18a21ac5e45f2d9eb40fe54c4) — selected: [{"after":[6,6]},{"after":[26,26]},{"after":[57,63]}]
- `src/daemon/__tests__/review-native-policy.test.ts` (378bcfd691625c6d09c4a254363e45d591e962e9) — selected: [{"after":[1,43]},{"after":[45,56]},{"after":[64,64]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (324266e8c0e64439d298df5b8aa41e122a7026df) — selected: [{"after":[1,2]},{"after":[7,9]},{"after":[11,12]},{"after":[14,15]},{"after":[22,23]},{"after":[25,30]},{"after":[32,41]},{"after":[47,49]},{"after":[51,51]},{"after":[53,53]},{"after":[56,61]},{"after":[64,64]},{"after":[68,74]},{"after":[83,85]},{"after":[105,107]}]
- `src/daemon/__tests__/task-review-plan-path.test.ts` (89eb061136daf94dc096e916435db9818311dc8f) — selected: [{"after":[4,4]},{"after":[9,9]},{"after":[16,16]},{"after":[25,28]},{"after":[30,42]},{"deletionAt":6}]
- `src/daemon/design-review-rpc.ts` (a26d9a8ea156ce2b2d1b1d685c8994ba80a3a060) — selected: [{"after":[1,2]},{"after":[4,8]},{"after":[10,10]},{"after":[14,14]}]
- `src/daemon/handler-runtime.ts` (6b7ffe45606a1713df4419a7a799473a0142fd6a) — selected: [{"after":[146,146]},{"after":[706,707]},{"after":[975,976]}]
- `src/daemon/index.ts` (30357d70d94c2d98a4c2739eb3435ff7747e8eaf) — selected: [{"after":[71,72]},{"after":[271,271]},{"after":[277,280]},{"after":[307,307]},{"after":[417,422]},{"after":[512,512]},{"after":[662,662]},{"after":[681,681]},{"deletionAt":283}]
- `src/daemon/review-native-policy.ts` (f7d3aac16aa938890f051eb4da754922c3be8618) — selected: [{"after":[1,23]},{"after":[25,80]},{"after":[82,91]},{"after":[97,98]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[1,54]},{"after":[56,60]},{"after":[63,76]},{"after":[78,107]},{"after":[115,115]},{"after":[117,118]},{"after":[120,193]}]
- `src/daemon/steps/design-review-step.ts` (a1a01bd95e60b3fcd1ae63d655ef1ce61cd5b182) — selected: [{"after":[3,4]},{"deletionAt":1}]
- `src/daemon/steps/task-review-step.ts` (49c1d070d5a70a9f5ca3c5fe5e67e4c88f2ac9e6) — selected: [{"after":[6,6]},{"after":[10,10]},{"after":[14,14]},{"after":[17,17]},{"after":[21,23]},{"deletionAt":0}]
- `src/daemon/task-review-rpc.ts` (91a21cf0a6bc598181221fcc54c7bcb2364b7fa3) — selected: [{"after":[2,4]},{"after":[6,12]},{"after":[14,17]},{"after":[19,19]},{"after":[25,35]},{"after":[39,45]},{"deletionAt":0}]
- `src/daemon/threads/__tests__/helpers/review-controller.ts` (ef6a7a6464783ed6c19d2f63c60a5a3c7aa3f439) — selected: [{"after":[1,2]},{"after":[4,12]},{"after":[28,30]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (6eed6c7ce1393aa311e1dc173d3d0ed0569008e5) — selected: [{"after":[24,37]},{"after":[43,44]},{"after":[47,49]},{"after":[51,55]},{"after":[65,65]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[84,86]}]
- `src/daemon/threads/review-processes.ts` (b7642468e77618470ab26c23e385a6994099cd39) — selected: [{"after":[106,106]}]
- `src/daemon/threads/review-worker-contract.ts` (dc78cf470cde8cf157edaa0c039216553c2de41a) — selected: [{"after":[22,23]}]
- `src/daemon/threads/review-worker-resources.ts` (5e64127ff404b3f0d4a9fb7b03b2821690be8045) — selected: [{"after":[7,8]},{"after":[20,20]},{"after":[33,33]},{"after":[37,37]},{"after":[40,40]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[45,45]},{"after":[52,56]},{"after":[64,65]},{"after":[77,77]},{"after":[97,105]},{"after":[130,131]},{"after":[190,191]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[42,43]},{"after":[100,100]},{"after":[123,123]},{"after":[155,155]},{"after":[158,158]},{"after":[334,337]},{"after":[339,339]},{"after":[395,400]}]
- `src/daemon/tools/review-git-command.ts` (17cffae89c1a887b2d04cdfc406315224a5b9bdd) — selected: [{"after":[1,15]}]
- `src/daemon/tools/review-shell-process.ts` (31b334230156e974e7a3ee6d4853ecdb545a516c) — selected: [{"after":[5,6]},{"after":[15,15]}]
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` (7a386f453d4e91b9c5d91b51f5a218e6f175acf3) — selected: [{"after":[492,521]},{"after":[1515,1539]},{"after":[1826,1826]},{"after":[2014,2014]},{"after":[2032,2032]}]
- `src/mcp/__tests__/schema-registry.test.ts` (791625cdadbba6fb5efb1372013fce135631fd23) — selected: [{"after":[49,49]}]
- `src/mcp/code-review/schema.ts` (ee399952d8a9d5ce1e501315cd556d50d6d6ca8c) — selected: [{"after":[6,6]},{"after":[12,13]}]
- `src/mcp/design-review/schema.ts` (5fd855c8a5026c077bdeacb42a5b0f531c8170bd) — selected: [{"after":[4,4]},{"after":[11,11]}]
- `src/shared/review-native.ts` (225d16f36f4681ca60cbd32cdcfbc55abd559d81) — selected: [{"after":[24,25]}]
- `src/shared/review-resources.ts` (3254a525b88d87e2f88941ba8f970db4761adc0f) — selected: [{"after":[18,21]}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[8,12]},{"after":[30,33]},{"after":[36,41]},{"after":[55,59]},{"after":[70,74]},{"after":[77,77]},{"after":[80,80]},{"after":[82,82]}]
- `src/workflow/code-review/task-review/__tests__/controller.test.ts` (08a34f45c4e08f57918c10d35f35e3b327981351) — selected: [{"after":[22,22]},{"after":[43,43]},{"after":[47,47]},{"after":[51,51]},{"after":[59,59]},{"after":[62,62]},{"after":[78,78]},{"after":[82,82]}]
- `src/workflow/code-review/task-review/__tests__/ownership.test.ts` (fb01bb7a7c9c2c5a7766f2a2470096e872945a91) — selected: [{"after":[6,6]},{"after":[13,13]},{"after":[21,21]},{"after":[24,24]},{"after":[30,31]},{"after":[33,33]},{"after":[35,35]}]
- `src/workflow/code-review/task-review/__tests__/progress-client.test.ts` (ee512924291a42f77168db286e4936e07982fe45) — selected: [{"after":[10,11]},{"after":[20,20]},{"after":[25,25]},{"after":[30,30]}]
- `src/workflow/code-review/task-review/worker-checkpoint.ts` (4aa9b1d075c01474bbe7e69beecc8eaa42f2c22c) — selected: [{"after":[7,7]},{"after":[47,50]}]
- `src/workflow/review/design-review/cleanup.ts` (b43d0375f863140d58003509d29181fdf708c65e) — selected: [{"after":[82,82]},{"deletionAt":26}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (324266e8c0e64439d298df5b8aa41e122a7026df) — selected: [{"after":[3,6]},{"after":[10,10]},{"after":[13,13]},{"after":[16,19]},{"after":[24,24]},{"after":[31,31]},{"after":[42,46]},{"after":[50,50]},{"after":[52,52]},{"after":[54,55]},{"after":[62,63]},{"after":[65,67]},{"after":[75,82]},{"after":[86,104]},{"after":[108,117]},{"after":[119,139]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[61,62]},{"after":[77,77]},{"after":[108,114]},{"after":[116,116]},{"after":[119,119]}]
- `src/daemon/threads/review-resource-recovery.ts` (d91b01775a31f8d1b7c210089dd013f0ddff6ebd) — selected: [{"after":[21,23]},{"after":[27,27]},{"after":[30,30]},{"after":[44,44]},{"after":[47,47]},{"after":[71,71]},{"after":[73,73]},{"after":[78,78]},{"after":[90,90]},{"after":[93,93]}]
- `src/daemon/threads/review-worker-admission.ts` (0e27edb4b3c55de4c26f5f0c3666b576325ed5e6) — selected: [{"after":[25,25]},{"deletionAt":26}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[176,176]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[111,111]},{"after":[338,338]},{"after":[363,363]},{"after":[376,376]},{"after":[378,378]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[98,98]}]
- `src/workflow/code-review/task-review/worker-admission.ts` (ea41641f3797d99d0f0c361e0f44cea2e369b20f) — selected: [{"after":[20,20]},{"after":[59,59]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (324266e8c0e64439d298df5b8aa41e122a7026df) — selected: [{"after":[20,21]},{"after":[140,165]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[142,142]}]
- `src/workflow/review/design-review/__tests__/admission-history.test.ts` (ec0dcae05fa3b809352dd59c6554f2e09c213339) — selected: [{"after":[4,4]},{"after":[82,82]},{"after":[85,88]},{"after":[112,112]}]
- `src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts` (b5a3f88bb67ef0f9065d850b6318a73356056471) — selected: [{"after":[30,35]},{"after":[45,45]},{"after":[47,47]},{"deletionAt":2}]
- `src/workflow/review/design-review/__tests__/correction-admission.test.ts` (e5ca4adfee8fe241f8d447785272b5dc0ae9941c) — selected: [{"after":[59,59]}]
- `src/workflow/review/design-review/__tests__/publication.test.ts` (308804a1e87a3365d7a690a0053c2e09f23a7e96) — selected: [{"after":[99,99]},{"after":[108,112]},{"after":[114,114]}]
- `src/workflow/review/design-review/action-admission.ts` (ab6ad1ec6ce494d3fff4773b1a185d374593b169) — selected: [{"after":[16,16]},{"after":[23,23]}]
- `src/workflow/review/design-review/admission-checkpoint.ts` (dbeea8f5476659fbffb0a3ec52287614b9ea3e74) — selected: [{"after":[88,88]}]
- `src/workflow/review/design-review/checkpoint.ts` (618ce14f7c2e63bf772302abf91d2be48076c1a0) — selected: [{"after":[60,60]}]
- `src/workflow/review/design-review/coordinator.ts` (3774f7fb6a77cd7de6ab9c44bfdca020befe2f78) — selected: [{"after":[131,131]},{"after":[156,156]},{"after":[168,168]},{"after":[178,178]},{"after":[189,189]},{"after":[199,199]},{"after":[229,229]},{"deletionAt":184}]
- `src/daemon/threads/__tests__/review-native-host.test.ts` (2e74533027a5dc6975e09aa2b367aab60a01f46b) — selected: [{"after":[1,27]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[14,14]},{"after":[160,176]}]
- `src/daemon/threads/review-native-host.ts` (64e5afff8573edbe768538324d11714569d5f1e3) — selected: [{"after":[36,38]},{"after":[73,73]},{"after":[113,116]},{"after":[120,120]},{"after":[128,128]},{"after":[136,136]}]
- `src/workflow/review/resource-recovery.ts` (08381389a423f9bb2eb65be1c70e6ab719e7d4fa) — selected: [{"after":[25,25]},{"after":[28,28]}]
- `design/task-review-final-scope-qualification.json` (5d2fff4455fee9eb2c18188ed488031ee6da9118) — selected: [{"after":[350,350]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (324266e8c0e64439d298df5b8aa41e122a7026df) — selected: [{"after":[118,118]}]
- `src/daemon/threads/__tests__/helpers/review-controller.ts` (ef6a7a6464783ed6c19d2f63c60a5a3c7aa3f439) — selected: [{"after":[3,3]},{"after":[13,27]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (6eed6c7ce1393aa311e1dc173d3d0ed0569008e5) — selected: [{"after":[57,57]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[118,118]},{"after":[143,143]},{"after":[148,148]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[136,136]},{"after":[145,154]}]
- `src/workflow/artifact-core/codecs.ts` (69e5943d38feb99c3b5e241ced04b1ac8a1cf06e) — selected: [{"after":[20,20]},{"after":[104,104]}]
- `src/workflow/code-review/task-review/__tests__/capacity.test.ts` (999eeea19ecd03b551f4ed9aa21eee04050973f4) — selected: [{"after":[52,52]},{"after":[66,66]},{"after":[93,93]},{"after":[109,109]},{"after":[113,113]}]
- `src/workflow/code-review/task-review/__tests__/cleanup.test.ts` (3c360f79d3c5ce9ea534701e795c85c66a15e398) — selected: [{"after":[15,15]},{"after":[95,96]},{"after":[103,103]}]
- `src/workflow/code-review/task-review/__tests__/compatibility.test.ts` (49c2bd33c0fee42a525681ebb34a7a248c81a043) — selected: [{"after":[30,30]}]
- `src/workflow/code-review/task-review/__tests__/controller-activity.test.ts` (4ee3f548418c004ea0d8a7745ba458d9eeeb4762) — selected: [{"after":[4,4]},{"after":[18,19]},{"after":[22,22]},{"after":[33,35]}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[34,35]},{"after":[49,53]},{"after":[60,69]},{"after":[81,81]},{"after":[87,87]}]
- `src/workflow/code-review/task-review/__tests__/coordinator.test.ts` (467b47808d0f3f6a9ceb57c9f6b78b40ca380c86) — selected: [{"after":[236,236]}]
- `src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts` (653e1404be7ea1e991626ff18a30c5d6196f9f82) — selected: [{"after":[66,66]},{"after":[85,85]},{"after":[97,97]}]
- `src/workflow/code-review/task-review/__tests__/history.test.ts` (c1df1d8015c7406752ef12a0f6c166f3fbb9c751) — selected: [{"after":[61,61]}]
- `src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` (7b18f123654f7f86f9c840a9d8042ab061297fd5) — selected: [{"after":[1,43]}]
- `src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts` (4b73991bf059d99194eff18192bc57581da658e9) — selected: [{"after":[19,19]},{"after":[22,22]},{"after":[37,38]},{"after":[44,44]}]
- `src/workflow/code-review/task-review/__tests__/recovery.test.ts` (ef2eb5ea7eff8a851988175d219e56cb8d9aef0b) — selected: [{"after":[11,11]},{"after":[30,30]},{"after":[41,41]},{"after":[47,47]},{"after":[53,53]},{"after":[56,56]},{"after":[61,61]}]
- `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` (9d53e3d5e7fb9a6f13827b76811ec50bdad41938) — selected: [{"after":[86,86]},{"after":[119,119]}]
- `src/workflow/code-review/task-review/admission-checkpoint.ts` (002c132c374dfba3f29c4c9b536e829285e8d598) — selected: [{"after":[46,46]}]
- `src/workflow/code-review/task-review/admission.ts` (af36c4db8b6a1a87d5ca2f0681e66d3e1e9110d3) — selected: [{"after":[78,78]},{"after":[80,80]},{"after":[108,108]}]
- `src/workflow/code-review/task-review/capacity.ts` (2d66bf8a0192c8e8f72600f06f79b5a0aad931e1) — selected: [{"after":[12,12]},{"after":[86,88]}]
- `src/workflow/code-review/task-review/cleanup.ts` (534cc31c4201ee07464c7be9119b7334b8ab06b0) — selected: [{"after":[33,33]},{"after":[44,44]}]
- `src/workflow/code-review/task-review/completion.ts` (60d24198033bf4e86862fbbf23e368f5ad240efd) — selected: [{"after":[3,3]},{"after":[13,13]}]
- `src/workflow/code-review/task-review/contracts.ts` (74091a68dc5736ae6fd4d3214526977b5bbc8d4b) — selected: [{"after":[118,119]},{"after":[152,152]}]
- `src/workflow/code-review/task-review/history.ts` (1883eee5e020e4ddb5c3c11d6bab44b1a676dfad) — selected: [{"after":[6,6]},{"after":[18,18]}]
- `src/workflow/code-review/task-review/publication.ts` (240f7db668deb81fff7acefb36a63640be7e75f7) — selected: [{"after":[3,3]},{"after":[33,33]},{"after":[40,40]},{"after":[45,45]},{"after":[84,84]}]
- `src/workflow/code-review/task-review/record.ts` (b534e852bfbd821043dbfb81f7e499e5d8e10a23) — selected: [{"after":[5,5]},{"after":[10,11]},{"after":[20,20]},{"after":[40,40]},{"after":[46,46]},{"after":[48,48]},{"after":[66,76]},{"after":[90,90]},{"after":[127,127]},{"after":[130,130]}]
- `src/workflow/code-review/task-review/summary.ts` (9970fa2fe85c46ae13070b18f0da49292b1c2654) — selected: [{"after":[7,13]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (fd8e004ff60713ae944cf2ac93b94f6e0aa66bdd) — selected: [{"after":[1,8]},{"after":[10,13]},{"after":[15,19]},{"after":[24,26]},{"after":[31,32]},{"after":[34,36]}]
- `src/daemon/threads/__tests__/helpers/review-production-fixture.ts` (e118f2b99c90b8774a7df0dfbe7a5826988b69b4) — selected: [{"after":[1,39]},{"after":[41,43]},{"after":[45,59]}]
- `src/daemon/threads/__tests__/helpers/review-production-native.ts` (19d3eda8c7df6e941c8d14088ff9b180879dc71a) — selected: [{"after":[1,1]},{"after":[3,10]},{"after":[13,23]},{"after":[31,31]},{"after":[32,47]},{"after":[54,55]}]
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts` (cebcf075404d758051b35f03a44818ed5147e246) — selected: [{"after":[1,2]},{"after":[4,83]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[4,4]},{"after":[16,47]},{"after":[49,54]},{"after":[59,62]},{"after":[79,100]},{"after":[104,130]},{"after":[132,140]},{"after":[142,158]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (811d93e63b47cde2344058487c7ebd94cdf9e0a2) — selected: [{"after":[82,85]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[27,27]},{"after":[35,35]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (fd8e004ff60713ae944cf2ac93b94f6e0aa66bdd) — selected: [{"after":[33,33]}]
- `src/daemon/threads/__tests__/helpers/review-production-fixture.ts` (e118f2b99c90b8774a7df0dfbe7a5826988b69b4) — selected: [{"after":[40,40]},{"after":[44,44]}]
- `src/daemon/threads/__tests__/helpers/review-production-native.ts` (19d3eda8c7df6e941c8d14088ff9b180879dc71a) — selected: [{"after":[2,2]},{"after":[11,12]},{"after":[24,30]},{"after":[48,53]},{"deletionAt":31}]
- `src/daemon/threads/__tests__/review-worker-daemon.test.ts` (1c0e84c813dde05a5c98411d2661b40277e5649c) — selected: [{"after":[1,140]}]
- `src/daemon/threads/__tests__/review-worker-isolation.test.ts` (cebcf075404d758051b35f03a44818ed5147e246) — selected: [{"after":[3,3]},{"after":[84,115]}]
- `src/daemon/threads/__tests__/review-worker-recovery.test.ts` (427b80bba4e27f7ecf36e5adc7863fb71d022682) — selected: [{"after":[3,3]},{"after":[48,48]},{"after":[55,58]},{"after":[63,78]},{"after":[101,103]},{"after":[131,131]},{"after":[141,141]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[184,184]}]
- `src/workflow/review/design-review/worker-admission.ts` (3f1626e0b04007f18a21ac5e45f2d9eb40fe54c4) — selected: [{"after":[27,27]},{"after":[69,74]}]
- `docs/daemon.md` (deb2ef611d4ddb5f2b986f3c74dab122c9d1c741) — selected: [{"after":[1945,2012]}]
- `docs/workflow.md` (42d8fba864ebd58d5a4cc7f0de34ff835b8a296b) — selected: [{"after":[20,37]}]
- `src/daemon/review-native-policy.ts` (f7d3aac16aa938890f051eb4da754922c3be8618) — selected: [{"after":[24,24]},{"after":[81,81]},{"after":[96,96]}]
- `src/daemon/review-service.ts` (8265e410e815a2467cfe2ebb1d9ae58398e32f61) — selected: [{"after":[55,55]}]
- `src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts` (986bfe0b6c154c2e71cb528dc430f9883b392106) — selected: [{"after":[25,25]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (fd8e004ff60713ae944cf2ac93b94f6e0aa66bdd) — selected: [{"after":[9,9]},{"after":[14,14]},{"after":[27,29]}]
- `src/daemon/threads/__tests__/helpers/review-worker-rpc.ts` (e3e8e457a8c3c12225a3441a9b17cb388cbef632) — selected: [{"after":[1,9]}]
- `src/daemon/threads/__tests__/review-worker-package.test.ts` (1e0a6bbb892ce45ed2d2da2f281fd25ee525846c) — selected: [{"after":[1,75]}]
- `src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts` (1cec33e92bd35f647ba5148670c20d26f8b19be3) — selected: [{"after":[4,4]},{"after":[7,9]},{"after":[22,22]},{"after":[29,29]},{"after":[38,39]},{"deletionAt":67}]
- `src/workflow/code-review/task-review/__tests__/controller-fixture.ts` (e4eb5270a3b9b0333d2a7291fcdf919096f99b33) — selected: [{"after":[4,4]},{"after":[75,76]}]
- `src/agent/providers/__tests__/helpers/review-process-worker.mjs` (66d1677dda02e2d36252437a673ecad41206659e) — selected: [{"after":[24,24]}]
- `src/agent/providers/__tests__/review-worker-process.test.ts` (8c2a7c60e4e4976a61296f72f587e957c1c2d622) — selected: [{"after":[10,10]},{"after":[19,19]},{"after":[22,22]},{"after":[32,32]},{"after":[46,46]},{"after":[48,49]},{"after":[115,138]}]
- `src/daemon/__tests__/review-native-policy.test.ts` (378bcfd691625c6d09c4a254363e45d591e962e9) — selected: [{"after":[44,44]},{"after":[57,63]}]
- `src/daemon/__tests__/review-worker-routing.test.ts` (324266e8c0e64439d298df5b8aa41e122a7026df) — selected: [{"after":[166,190]}]
- `src/daemon/review-native-policy.ts` (f7d3aac16aa938890f051eb4da754922c3be8618) — selected: [{"after":[92,95]}]
- `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` (4db9bd6f2c3e797207129b4743102ff0a2c8eb43) — selected: [{"after":[129,131]}]
- `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` (01a95fd086bc5910f00d6b2951e36e32be91edeb) — selected: [{"after":[4,4]},{"after":[88,96]}]
- `src/daemon/threads/__tests__/review-worker-publication.test.ts` (6171e0d272fab0297c481a249b9b7ce03f27293c) — selected: [{"after":[38,49]}]
- `src/daemon/threads/__tests__/review-workers.test.ts` (811d93e63b47cde2344058487c7ebd94cdf9e0a2) — selected: [{"after":[113,120]}]
- `src/daemon/threads/review-cleanup-discovery.ts` (6eed6c7ce1393aa311e1dc173d3d0ed0569008e5) — selected: [{"after":[21,21]},{"after":[45,46]},{"after":[50,50]}]
- `src/daemon/threads/review-worker-admission.ts` (0e27edb4b3c55de4c26f5f0c3666b576325ed5e6) — selected: [{"after":[33,33]},{"after":[46,48]}]
- `src/daemon/threads/review-worker-runtime.ts` (80e9024908d9fc54e243c4784b10cf0c48f7d245) — selected: [{"after":[82,82]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[78,80]},{"after":[129,133]},{"after":[138,138]},{"after":[171,171]},{"after":[231,240]},{"after":[255,255]},{"after":[270,272]},{"after":[274,275]},{"after":[285,291]},{"after":[364,364]}]
- `src/daemon/tools/review-shell-process.ts` (31b334230156e974e7a3ee6d4853ecdb545a516c) — selected: [{"after":[14,14]},{"after":[26,26]}]
- `src/shared/vibe-session.ts` (2a52eca9f523bdc3d2a5f62cf04daafa840aacee) — selected: [{"after":[102,102]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (3b8fea77936c83c24a716c2829ca4c178b242068) — selected: [{"after":[77,111]}]
- `src/workflow/code-review/task-review/capacity.ts` (2d66bf8a0192c8e8f72600f06f79b5a0aad931e1) — selected: [{"after":[14,15]},{"after":[85,85]},{"after":[89,90]},{"after":[96,96]}]
- `src/workflow/code-review/task-review/publication.ts` (240f7db668deb81fff7acefb36a63640be7e75f7) — selected: [{"after":[126,130]}]
- `src/workflow/code-review/task-review/record.ts` (b534e852bfbd821043dbfb81f7e499e5d8e10a23) — selected: [{"after":[42,42]}]
- `src/workflow/review/design-review/__tests__/worker-admission.test.ts` (e05962aa4d8ac01aa44d796b9e7a37b391ee0792) — selected: [{"after":[33,33]},{"after":[49,52]},{"after":[115,143]}]
- `src/workflow/review/design-review/worker-admission.ts` (3f1626e0b04007f18a21ac5e45f2d9eb40fe54c4) — selected: [{"after":[28,28]},{"after":[76,76]},{"after":[99,99]},{"after":[131,131]}]
- `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` (3b8fea77936c83c24a716c2829ca4c178b242068) — selected: [{"after":[60,61]}]
- `src/workflow/code-review/task-review/__tests__/derived-completion.test.ts` (7ba27439f94158707cd2bbbf339478f7943f912e) — selected: [{"after":[26,26]}]
- `src/workflow/code-review/task-review/completion.ts` (60d24198033bf4e86862fbbf23e368f5ad240efd) — selected: [{"after":[4,4]},{"after":[26,27]}]
- `src/daemon/threads/__tests__/helpers/review-terminal-drain.ts` (5673f26cc367915f2089ba6fbc2c3246f3afcb23) — selected: [{"after":[1,11]}]
- `src/daemon/threads/__tests__/review-worker-publication.test.ts` (6171e0d272fab0297c481a249b9b7ce03f27293c) — selected: [{"after":[50,68]}]
- `src/daemon/threads/review-workers.ts` (e62eb0cd4b085ba49e32f731b5a9cfa5032e3545) — selected: [{"after":[292,300]},{"after":[302,302]}]
- `src/daemon/threads/__tests__/helpers/review-production-daemon.ts` (fd8e004ff60713ae944cf2ac93b94f6e0aa66bdd) — selected: [{"after":[20,23]},{"after":[30,30]}]
- Task t1: reassess; changes 0, 1, 2, 3, 4, 5, 109, 309, 314; identity 44882db4c810a7df50792bacb8187a63c002a66fe87ea45b97672438c2c49b92
- Task t2: reassess; changes 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 110, 150, 151, 152, 170, 171, 179, 283, 284; identity f2888c389d80ec30609baad4ab006b436d27e42e3fae958bf9a8260b6c6d6636
- Task t3: reassess; changes 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 278, 296, 303, 304, 305, 309, 310, 311, 313, 314, 315, 316, 317, 318, 359, 360, 361, 362, 365, 366, 367; identity 95e0c327f1a4e24c852bb7e32c9cd1de3a4fe1756192464188d54c60eda05f18
- Task t4: reassess; changes 47, 48, 49, 50, 53, 54, 64, 75, 163, 168, 249, 288; identity 3f5f48c53297f5a13140295b701b2c03ce815918493b027586f50653abd06c1a
- Task t5: reassess; changes 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 83, 98, 107, 260, 336, 344, 345, 346, 348, 357, 358; identity c9cfc9043e7f140792f6fe1f9096432b419cc4e9b82780492970be4b12c2565f
- Task t6: reassess; changes 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 254, 255, 346, 348, 357, 358; identity af04def30f3f37e69219034b8f8477a6d8a484047e3cbdb8e416f009c6a5d769
- Task t7: reassess; changes 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 101, 102, 104, 112, 134, 349; identity 052031a1ea4840eb2ea47c89a753097e61549fdd0b8ef6b3f88a99c6c61d91a3
- Task t8: reassess; changes 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 128, 129, 130, 133, 135, 141, 142, 143, 248, 251, 253, 286, 288, 295, 324, 350, 351, 352, 353, 354, 355, 356, 368, 369, 370; identity b59b838992ec3801d3dbe3a5cbb80e757d7590440e7ebb3888cabcd85e1f9bd1
- Task t9: reassess; changes 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 175, 176, 203, 211, 230, 262, 263, 264, 265, 266, 271, 272, 274, 275, 297, 299, 300, 301, 302, 306, 307, 308, 309, 310, 311, 342, 343, 352, 356, 359, 360, 362; identity c012c0f850c9e971a14d6a3ff41ea9beac39908cef20a6f35d4d3d1a5d76c6c9
- Task t10: reassess; changes 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 179, 180, 204, 234, 277, 278, 279, 280, 281, 282, 283, 284, 285, 332, 333, 351, 354, 355, 356, 363, 364; identity 625cdc0a4fc6419031e393fb5a6142809e48c8b8b2edd0f33b60b14ccac646f0
- Task t11: reassess; changes 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 270, 289, 325, 338; identity b274057ef4f6ce9c7d644f04ca91371a4fe81b3ef3d8d8cd8c259c2ea995321f
- Task t12: reassess; changes 40, 41, 43, 44, 45, 106, 108, 125, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 221, 265, 306, 355, 356, 363, 364; identity 724c5b57d995cf048124038fb092e2b13366afda326e6eb86a126b5d21266db9
- Task t13: reassess; changes 24, 25, 28, 31, 33, 34, 37, 46, 162, 167, 172, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 247, 267, 287, 288, 289, 292, 293, 294, 295, 298, 305, 307, 312, 313, 315, 316, 317, 318, 333, 347, 350, 351, 353, 354, 356, 359, 360, 361, 362, 365, 366, 367, 368, 369, 370, 371; identity f37d0ecfe0c7b800a5b29010cc186fc782fb5905d6050a1eb9966afe5dec44a8
- Task t14: reassess; changes 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 286, 288, 290, 291, 295, 336, 337, 344, 345, 346, 347, 348, 352, 353, 354, 356, 357, 358, 364; identity f50c6d476cb52f818920bd773a881a03de2fac1f098ef63e199b673a83b46d70
- Task t15: reassess; changes 47, 51, 58, 66, 74, 85, 94, 99, 111, 114, 158, 159, 160, 161, 173, 174, 177, 178, 215, 216, 217, 246, 286, 287, 291, 292, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 338, 339, 344, 345, 346, 347, 349, 350, 351, 352, 356, 359, 360, 361, 363, 365, 366, 367, 368, 369, 370, 371; identity 66cc0dcb09b60bcda7c8e42b413c585b28cc05da80149be48b1beab73a5ab5ea
- Task t16: reassess; changes 63, 79, 83, 260, 290, 319, 320, 321, 326, 327, 328, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 371; identity af73f0db918747d5da9ad8a066fd51227454a54482eb39b950b21f032ecd9431

Attributed all 372 changes and all 115 required tests using the pinned PLAN/LLD, attempt-3 submission and saved attempt-2 feedback. All tasks require reassessment against the final revision; no prior findings are declared resolved here. Cross-cutting evidence is shared by behavior. Unchanged regressions and other-Story tests verify compatibility without expanding finding scope. Every supplied requiredWitnessChangeIndexes is empty, so no additional witness indexes are required. Reported client-test failures remain unresolved evidence. No code findings are produced.

### t1: changes_requested

Reviewed all submitted t1 changed segments, pinned requirements/design, all four acceptance checks and relevant test assertions. Found one historical checkpoint compatibility regression.

Coverage: **verified** — Completed assertion-level inspection of all nine submitted test files and relevant integrated worker tests. Assessed all four acceptance checks: admission discrimination and immutable input; historical/version and attempt semantics; bounded exact-review resource contracts and serialized writes; safe unqualified-consumer refusal and retained source/completion checks. Assertions cover these behaviors, including lease preservation during replay and feedback saves. Historical mixed story-id aliases are not covered, as reported in the finding. This assessment establishes coverage review, not test execution.

- **MED** `src/workflow/code-review/task-review/admission-checkpoint.ts:16`: Preserve supported story-id aliases when validating historical qualified attempts.
  The previous admission path explicitly accepted both s1 and STORY-<hash>-s1, compared them canonically across attempts and preserved their submitted spelling. Therefore a valid version-1 checkpoint can contain both spellings. This new exact-string comparison rejects that history when appendCodeAdmission or an integrated worker save converts the envelope to version 2, blocking subsequent admission/recovery despite an unchanged subject. Validate historical qualified subjects using the existing canonical identity rules without rewriting pinned packets. Add a regression covering mixed spellings across legacy attempts; the inspected compatibility fixtures use matching spellings throughout.
  Evidence: `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission-checkpoint.ts`, `5e5dee5cb12090485bceb65e9d4b9ad221e9bc7e:src/workflow/code-review/task-review/admission.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/packet.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-checkpoint.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`

Optional verification and advice (nonblocking):

- Optional execution: Tests, integration checks, typechecks and builds were not run. Builder-reported results at earlier revisions were not treated as independently verified execution of the reviewed pin.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/review-resources.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/contracts.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/compatibility.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/final-scope-contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/packet-documents.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/transition.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/publication-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/packet.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/capacity.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/publication.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `5e5dee5cb12090485bceb65e9d4b9ad221e9bc7e:src/workflow/code-review/task-review/admission.ts`

### t2: passed

Reviewed all submitted t2 segments at ef85c2d168518ff9ec115611f9f119798fe69e70 against the pinned LLD, PLAN and four acceptance checks. No material defects found.

Coverage: **verified** — Inspected test bodies and assertions covering immutable admission input/action identity, rejection of premature results and unsupported versions, unchanged historical reads, serialized legacy/resource/progress writes, unresolved-lease preservation, recovery qualification and sealed outcomes. Additional assertions cover historical full recovery, impact corrections, artifact invalidation, explicit restart, admission approval refusal and preservation of published approval evidence. This assessment establishes coverage by inspection, not execution.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run. Supplied passing results remain builder-reported and were not treated as independent execution evidence for the pinned revision.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/contracts.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/action-state.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/approval.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/review-resources.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/fixtures.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/impact-contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/action-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/approval.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/subject-monitor.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/correction-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/selected-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-clearance.test.ts`

### t3: passed

Completed review of all selected implementation segments and deletion anchors against the pinned design, requirements, five acceptance checks, and relevant test assertions. Both prior findings are corrected, and the current BUILD-author independence guard rejects same-party and unknown authorship. No blocking defects found.

Coverage: **verified** — Reviewed test bodies and assertions for all five acceptance checks. Both review families cover technical-failure retention, qualification separation, publication replay, approval exclusion, permanent reads, and guard auditing. Mutation assertions cover preservation of reviewed input, source, and results. New regressions exercise pass → admission failure → next qualification, unsupported-version byte preservation during technical publication, and current-author independence. Compatibility tests cover provenance, completion, capacity, publication faults, and readers. This assessment establishes coverage inspection, not test execution.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks, or builds were run. Supplied passing results are builder-reported: the broad sweep identifies 35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5, and the targeted completion/history batch identifies source matching 8ebc81c96f18e0dbc16e87eacfbee44bb8f8bf2c. Neither was treated as an independently executed result for the reviewed pin.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/capacity.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/completion.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/contracts.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/history.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/progress-view.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/publication.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/record.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/summary.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/final-scope-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/capacity.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/approval.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/contracts.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/history.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/provenance.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/publication.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/read.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/results.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/approval.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/history-aggregate.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/persistence-fence.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/provenance.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/readers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/report-log.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/resource-audit.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/party.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/artifact-core/codecs.ts`
- `a846d30e1a267f05701aa73a5e5f203bc6b4433d:src/workflow/review/design-review/checkpoint.ts`
- `4f6a30832c1f4b1a6fdc51fa8695cf5f67bbf22c:src/workflow/review/design-review/coordinator.ts`

### t4: passed

Inspected every submitted t4 changed segment at ef85c2d168518ff9ec115611f9f119798fe69e70 against the pinned LLD, PLAN and all five acceptance checks. No blocking defects found.

Coverage: **verified** — Reviewed test bodies, assertions and supporting fixtures. Coverage addresses reservation before spawn, identical and conflicting replay, durable-intent enforcement, cancellation during reservation/validation/spawn, bounded output and blocked-consumer cancellation, confirmed versus unknown disposal, targeted fencing and replacement exclusion. Adapter, production-policy and recovery assertions cover actual worker loss, permission/provenance rejection, shutdown ordering and explicit clearance. Native-broker tests assert its daemon-only boundary. Builder-reported executions were not treated as reviewer executions or proof of the current pinned revision.


Optional verification and advice (nonblocking):

- Optional execution: Tests, integration checks, typechecks and builds were not run during this review.
- Design companion diagram sources were inspected; browser rendering was not verified.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-processes.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-native-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/shell-helper.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/process-group.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-process-bridge.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-native-policy.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-processes.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-native-host.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/review-worker-process.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/process-broker-native.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-native-policy.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/cli-subprocess.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t5: passed

Reviewed all submitted t5 segments against the pinned LLD, PLAN and four acceptance checks. The Vibe authorization correction resolves the prior finding. No material defects found in the selected scope.

Coverage: **verified** — Completed inspection of relevant test bodies and assertions. Coverage addresses durable-intent ordering, host leases, real-worker parsing and termination cleanup, bounded output, cancellation, late-output suppression, spawn/observer/save failures, asynchronous executable lookup and unbound-worker refusal. The Vibe regression exercises production authorization in a real worker; policy tests reject incorrect classification, controller inference, unqualified receipts and unsafe arguments. Compatibility tests cover provider selection, model/effort verification, read-only restrictions, schemas, retries, deadlines and unchanged non-review calls. Builder-reported executions were not treated as fresh executions of the pinned revision.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run by this reviewer; supplied results remain builder-reported.
- Optional execution: Inspected sequence and component companion sources; browser rendering was not verified.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/cli-provider.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/review-worker-process.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-processes.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/process-group.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-process-bridge.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/vibe-session.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native-guard.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-native-policy.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/review-shell-process.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-native-policy.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-native-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/analyze/context/role-router.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/analyze/context/shaper-provider.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/cli-review-session.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/cli-vibe.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/vibe-session.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-processes.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-spawn-inventory.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-native-host.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/process-broker-native.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t6: failed

Reviewer failed: commit: Commit pointer is unavailable

Coverage: **unverified** — No valid completed assessment was obtained.


Review limitations (blocking):

- Reviewer failed: commit: Commit pointer is unavailable

Inspected references:


### t7: passed

Reviewed all submitted t7 segments against the pinned LLD, PLAN and six acceptance checks. No blocking defects found. The corrected async-context regression now asserts reliably.

Coverage: **verified** — Inspected test bodies, assertions and supporting fixtures. Source and compiled startup checks cover both coordinator families, inherited settings, store ownership and durable unverified admission. Identity tests assert rejection of foreign and stale messages. Bootstrap tests verify the 30-second configuration, bounded failure for never-ready and pre-save hangs, rejection of late receipts, nonreusable fences and eventual lock/store reclamation. Isolation tests assert continued unrelated work and targeted disconnect behavior. Native probes exercise CLI and raw-byte tool transport, immutable role and missing-binding refusal. The corrected async-context test captures context inside the consumer and asserts it after start resolves. Package tests exercise compiled startup without source or a TypeScript loader. Static inspection confirms the timer precedes creation, completion requires readiness plus a matching durable receipt, and no fallback or activation flag is introduced. Builder-reported execution was not treated as fresh execution of the pinned revision.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review. Supplied results remain builder-reported and revision-specific.
- Optional execution: Inspected design definitions and generated companion source; browser rendering was not performed.
- Naming and ownership follow relevant TypeScript examples including startWorker, startDaemonWorker, ThreadServices and StatusBoardClient. No material separation-of-concerns, encapsulation, readability or wire-compatibility issue was found in the selected changes.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-bootstrap-hang.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-bootstrap.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-contract.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native-guard.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-process-bridge.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/worker-entry.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/main-services.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-package.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-daemon.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t8: changes_requested

Completed inspection of all submitted selected segments, relevant LLD/PLAN requirements, all six acceptance checks, and test bodies/assertions. Prior controller-advance and terminal-reclamation findings are corrected, including delayed terminal drain. One MED production reviewer-refresh defect remains.

Coverage: **verified** — Coverage assessment is complete against pinned test bodies, assertions, and relevant fixture implementations. All six checks were assessed: distinct real-worker identities and concurrent isolation; trusted family dispatch plus wrong-owner/stale-envelope refusal; targeted loss and reclamation; subject/cleanup exclusions and actual consumers; daemon-observer versus controller lifetime; and CLI/shell policy, durable intents, cancellation, and disposal. Additional assertions cover serialized admission replay, completed replay, permanent-history versions, model-free publication, terminal subject release, and delayed idleness without checkpoint mutation. The finding identifies a production transition missing from the fixture-based reviewer-refresh regression. Builder-reported passes were not treated as reviewer executions or proof of that transition.

- **MED** `src/daemon/threads/review-workers.ts:232`: Resolve fresh tracked reviewer authority before restarting a live design review.
  For restart_full, this call omits the admission input. The production resolver, ProductionReviews.scope, consequently returns registry.registeredScope(key) immediately while the entry exists. Its reviewer therefore always equals e.scope.reviewer, making the replacement branch ineffective in production. If artifact authorship changes while an invalidated worker remains registered, restart runs in the old worker; its prepare adapter rejects the new reviewer and records failed recovery instead of starting the explicitly requested independent review. The changed-author regression uses a fixture resolver that rereads artifact metadata, so it does not exercise this production short circuit. Request fresh tracked scope explicitly and cover the transition through ProductionReviews.
  Evidence: `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks, or builds were run by this reviewer. Supplied results remain builder-reported; earlier broad qualification predates the corrections, while targeted results identify cdb65e9 and f05b5d8 source versions.
- Optional execution: Sequence and component companion sources were inspected; browser rendering was not performed.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-native-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-bootstrap.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-contract.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-cleanup-discovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/status-board.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/types.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-processes.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-request-owner.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/worker-requests.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-native-host.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-processes.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/review-worker-process.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-terminal-drain.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-maintenance.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t9: passed

Reviewed every submitted t9 changed segment and deletion anchor at the pinned revision against the LLD, PLAN and all six acceptance checks. No material in-scope defect found. Durable admission, qualification, controller ownership, recovery, history preservation and serialized resource updates remain consistent with the design.

Coverage: **verified** — Coverage review is complete and based on test bodies and assertions. Registered-worker tests assert acknowledgment before blocked source qualification, qualified persistence before provider dispatch, replay/conflict handling, persisted admission failures, immutable history, assignment identity, stale-execution rejection, explicit recovery and lease retention. Registry and IPC tests cover controller authority, foreign next-attempt refusal and cleanup reservations. Regression assertions cover attribution, dependency ordering, committed selected blocks, final revision pins, projection ceilings, capacity, activity and recovery. Builder-reported execution was not treated as independent execution of the pinned revision.


Optional verification and advice (nonblocking):

- Optional execution: Tests, integration checks, typechecks and builds were not independently run. Supplied results remain builder-reported; the broad sweep predates later corrections.
- Optional execution: Diagram rendering was not performed. The pinned sequence and component diagram sources were inspected for consistency with the design.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/controller.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/capacity.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/record.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-contract.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/capacity.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/compatibility.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller-activity.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/coordinator.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/attribution-scope.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/selected-code.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/projection.test.ts`
- `a071a507e09ebcb4cddb0600b69bd70d07e81ab8:src/daemon/threads/review-worker-runtime.ts`
- `d68f0d77228c951930b9d8b77430b9715a0225f9:src/daemon/threads/review-worker-admission.ts`
- `35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts`

### t10: changes_requested

Completed inspection of all submitted t10 changed segments, pinned requirements/design, six acceptance checks and relevant test assertions. Rejected-restart identity is corrected, but two publication/reviewer-refresh recovery defects remain.

Coverage: **verified** — Completed the coverage assessment using test bodies and assertions for all six acceptance checks. Barrier fixtures assert durable unverified admission before qualification and provider dispatch. Route tests assert Epic, standalone and ISSUE ancestry and independent party selection. Controller, impact, consolidation and retry suites assert successful trusted exchanges, stale-generation refusal, saved feedback, selected corrections, fresh final consistency and bounded dispatches. Monitoring tests assert target invalidation and unrelated-change tolerance. Registry and checkpoint tests assert cross-worker subject exclusion, targeted owner loss and serialized resource-intent preservation; daemon tests cover retained-history resource fences and explicit recovery. Publication and admission-history suites assert model-free replay and preserved approval evidence. The two findings identify concrete transitions these assertions miss. Verified means the coverage inspection is complete, not that tests were executed.

- **MED** `src/workflow/review/design-review/worker-admission.ts:61-62`: Cold public publication retries cannot save historical version-1 checkpoints.
  The public design recover route creates a regular worker without maintenance=true. Publication admission now preserves the historical checkpoint's version, but this save adapter permits version-1 publication writes only for maintenance workers. retryPublication therefore reaches saveWorkerDesignCheckpoint and fails with 'Durable version-2 design admission missing' before publication. Preserve historical publication writes for the public retry path too. The new cold-publication regression checks admission and preservation identity only; the end-to-end historical publication test uses publishStored maintenance workers.
  Evidence: `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-checkpoint.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/resource-recovery.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- **MED** `src/daemon/threads/review-workers.ts:232-233`: Production restart authority refresh returns the incumbent worker's cached reviewer.
  resolveScope is called without an admission input. ProductionReviews.scope explicitly returns registry.registeredScope for that call shape, so this comparison cannot detect changed authorship while the incumbent entry exists. An approved restart submitted after invalidation but before terminal reclamation reuses the original worker and fails its prepare reviewer-equality guard instead of creating the independent reviewer required by the current author. Request fresh tracked authority here. The new regression injects a resolver that always rereads authorship, bypassing production's cache and missing this failure.
  Evidence: `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review. Supplied passing results are builder-reported at 35188a6ffde3b4ae3ef237937f8c8d70e3ce70e5, cdb65e9fd02dc7b1d2ae93ae5e64fd76efd622e9 and f05b5d891ec873cb9517bfdc86ae57a0f332b76f; they were not treated as reviewer executions of the pinned ef85c2d168518ff9ec115611f9f119798fe69e70 implementation.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/action-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/action-state.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/contracts.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/recovery-state.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/request-signature.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/design-review-rpc.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/resource-recovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/fixtures.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/helpers/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/action-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/activity-monitor.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/assignment-schema.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/capacity.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/controller.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/coordinator.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/correction-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/impact-consolidation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/impact-contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/impact-execution.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/impact-qualification.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/impact-selection.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/policy-results.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/retry.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/selected-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/subject-monitor.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/subject.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`
- `aa9aa072f7f491ef4f3271a9a152f148d081cc0c:src/workflow/review/design-review/coordinator.ts`
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/coordinator.ts`
- `4cf76bd731f7c4ffe0347aecfa06b302fb367394:src/workflow/review/design-review/__tests__/consolidation-recovery.test.ts`

### t11: passed

Completed review of every submitted t11 segment against the pinned LLD, PLAN and seven acceptance checks. No material in-scope defects found.

Coverage: **verified** — Inspected pinned test bodies and assertions. Coverage addresses both families, retained-attempt and legacy fences, exact broker binding, rejected fabricated/stale approvals, denial/expiry/disconnect, bounded receipts, metadata-only clearance, disposable-host and full-daemon crashes, unrelated-review availability, partial clearance, audit repair, separate recovery and immutable failed attempts. Lost pending broker requests were assessed against memory-only broker ownership and checkpoint mutation occurring only after an accepted answer. Builder-reported executions were not treated as executions of the final pin.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review.
- Optional execution: Diagram companion sources were inspected; browser rendering was not performed.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-crash-daemon.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-native-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-processes.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-resource-recovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-resource-worker.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/process-group.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/admission-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/resource-recovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/resource-audit.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/approval-broker.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/review-resources.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-processes.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-native-host.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/action-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery-contracts.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/process-broker-native.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/approval-broker.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/approval-ipc.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/sequence-diagram.html`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/standalone/isolate-each-code-design-review-its-E20261109e4af6312/S001/component-dependency.html`

### t12: passed

Reviewed all submitted t12 segments against the pinned LLD, PLAN and five acceptance checks. No material defects found in cached progress, attempt tracking, controller authority or supported-client delivery.

Coverage: **verified** — Inspected relevant test bodies and assertions at the reviewed pin. Real-worker tests cover responsive cached observation during blocked code/design admission, explicit unverified zero inventory, technical failure without provider dispatch, artifact delivery and status-board isolation. Controller tests assert owner rejection, replay behavior and execution identity preservation. Recovery tests cover rejected restart identity and refreshed reviewer authority; terminal-drain assertions verify reclamation without another checkpoint mutation. VS Code and Kotlin tests cover preparation/failure/completed labels and DTO compatibility, with existing reader and artifact-content assertions covering qualified-view compatibility. All five acceptance checks were assessed. This verifies the coverage review, not test execution.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks, builds or live IDE checks were run. Supplied test results are builder-reported at their stated versions; earlier qualification was not treated as execution of this pin.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/progress-view.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/contracts.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/worker-progress-source.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/artifact-content.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/types.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-worker-progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/cli/panes/DaemonPane.tsx`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/status-board.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/admin-status.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/main-services.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/worker-entry.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-contract.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-terminal-drain.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/helpers/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-execution.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-persistence.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/activity-monitor.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/coverage-progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/readers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/docs-review-client.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/docs-review-panel.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/protocol.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/docs-review-client.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/review-frame-message.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/review-presenter.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ReviewWorkerProgressDto.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentPane.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewToolWindow.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgress.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentTest.kt`

### t13: changes_requested

Completed inspection of all submitted changed segments, pinned design/requirements and relevant test assertions. The prior version-check findings are corrected. One remaining cleanup defect can remove checkpoints whose permanent history readers reject.

Coverage: **verified** — Completed assertion-level coverage assessment for all six acceptance checks and all submitted changed test/helper bodies. Recovery tests assert retained task/chunk feedback, dispatch counters and stale-owner rejection. Publication tests assert zero provider calls and unchanged publication counts after worker replacement or lost receipts; preservation tests distinguish guard-only changes from input/result changes. Cleanup tests exercise actual approval consumers, unknown admission scopes, concurrent publication, preserved failures, clearance audits and post-cleanup reads for both families. Resource tests assert exact broker bindings, partial/stale clearance and historical fences. Shutdown tests assert durable lease closure before worker exit and replacement; terminal-drain coverage asserts reclamation without another checkpoint mutation. The missing pre-cleanup capability-mismatch assertion is included in the finding. Builder-reported runs were not treated as reviewer executions or fresh proof of the pinned revision.

- **MED** `src/workflow/code-review/task-review/cleanup.ts:37-38`: Validate the permanent CR's version/capability correspondence before deleting its checkpoint.
  Cleanup accepts either schemaVersion 2 or 3 and validates only the body. Its requalification path also accepts both versions without checking their correspondence with preserved failures. Consequently, after BUILD approval, a CR containing admissionFailures but declaring version 2 can pass preservation checks and have its checkpoint deleted, while readTaskReviewHistory subsequently rejects that same CR with a capability mismatch. Use equivalent validation to the permanent reader before deletion. The cleanup regression tests mutate this capability only after deletion; add a pre-cleanup mismatch case asserting retention and unchanged checkpoint bytes.
  Evidence: `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/cleanup.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/history.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/task-review-rpc.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run. Conclusions use pinned source and assertion inspection; supplied execution results remain builder-reported and revision-specific.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/publication.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/record.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/summary.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/history.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/completion.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/capacity.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/cleanup.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/approval.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/history.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/publication.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/read.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/cleanup.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/coordinator.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/resource-audit.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/resource-recovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/cleanup-owner.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/artifact-core/store.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/artifact-core/write-authority.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/task-review-rpc.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-native-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/artifact-write-authority.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/main-services.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-cleanup-discovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-progress.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-contract.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/worker-entry.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/artifact-writer.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-maintenance.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-controller.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-terminal-drain.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-daemon.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/cleanup.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/cleanup.test.ts`

### t14: changes_requested

Completed review of all submitted selected segments, pinned requirements/design, eight acceptance checks and relevant test assertions. The prior no-document cleanup finding is corrected. One MED production routing defect remains.

Coverage: **verified** — Completed evidence-backed coverage review for both-family RPC/MCP delegation, disabled session threading, durable admission, native authorization and spawn fencing, controller ownership/replay/disconnect, immutable failed attempts, whole-history resource clearance, model-free publication and approved cleanup. Inspected test bodies and assertions, including the successful no-document cleanup regression. The missing Vibe production-route case is captured in the finding. Builder-reported executions at earlier versions were not treated as fresh pinned-version execution evidence.

- **MED** `src/daemon/review-service.ts:133`: Accept the supported Vibe client on code-review start/resume and add a production MCP routing regression.
  The step host accepts context.client='vibe', and handleTaskReviewStep forwards that value to codeStart. This guard accepts only claude/codex, so a valid Vibe MCP start or resume throws 'Unsupported review client' before dedicated-worker admission. The worker route and familyForClient already support Vibe. The new Vibe test exercises provider/native authorization directly and therefore misses this production entrypoint failure.
  Evidence: `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/steps/task-review-step.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/steps/host.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/step-context.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-contract.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/model-registry.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/review-worker-process.test.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`, `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`

Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run during this review; supplied execution results remain builder-reported.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-native-policy.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/task-review-plan-path.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/design-review-rpc.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/handler-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/index.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-native-policy.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/steps/design-review-step.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/steps/task-review-step.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/steps/host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/task-review-rpc.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/model-registry.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-controller.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-cleanup-discovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-native-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-processes.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-contract.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-resource-recovery.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/review-git-command.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/review-shell-process.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/mcp/__tests__/fixtures/tool-surface.golden.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/mcp/__tests__/schema-registry.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/mcp/code-review/schema.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/mcp/design-review/schema.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-resources.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/step-context.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/vibe-session.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-checkpoint.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/cleanup.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:design/task-review-final-scope-qualification.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/review-worker-process.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-native-host.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-spawn-inventory.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/transition.test.ts`

### t15: passed

Reviewed every submitted selected segment against the pinned LLD, PLAN and all eight acceptance checks. Inspected relevant test bodies and assertions. No material in-scope defect found.

Coverage: **verified** — Coverage review is complete. Assertions cover blocked-admission responsiveness; distinct real workers and stale-message rejection; bootstrap bounds and targeted disconnects; durable native intent, authorization denial, byte backpressure and worker-loss cleanup; whole-history fences and broker-bound clearance; immutable failed attempts and separate explicit recovery; model-free publication and approval cleanup. Production-construction and full-daemon fixtures exercise both review families. Correction regressions cover reviewer independence, unsupported versions, cold publication identity, controller advancement and delayed terminal reclamation. Builder-reported executions at earlier revisions were not treated as execution proof for the final pin.


Optional verification and advice (nonblocking):

- Optional execution: No tests, integration checks, typechecks or builds were run by this reviewer. Supplied results remain builder-reported at their stated tested versions; they do not establish execution of the final reviewed pin.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-workers.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/review-worker-runtime.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/worker-admission.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/capacity.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/publication.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/completion.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-processes.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/review-worker-process.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/helpers/review-process-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-bootstrap.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-workers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-crash-daemon.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-controller.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-daemon.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `8fe4b316c850a6e25999e81f683a66818a838290:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-terminal-drain.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-clearance.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-cleanup.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-native-host.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-native-policy.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/admission-history.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/derived-completion.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/artifact-write-authority.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/worker-admission.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/ownership.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller-activity.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/activity-execution.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/checkpoint-outcomes.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/cleanup.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-client.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/progress-e2e.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/activity-monitor.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/approval.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/cleanup.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/controller.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/persistence-fence.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/publication.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/recovery.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/subject-monitor.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/process-broker-native.test.ts`

### t16: passed

Completed review of every submitted Task16 segment and deletion anchor against the pinned requirements, design and five acceptance checks. No material in-scope defects found. The committed packet at 69e74f592d90d89320c16ffa3e8b1f66b8f8064f exactly matches the current submission and pins ef85c2d168518ff9ec115611f9f119798fe69e70. Packaging assertions, compatibility evidence and release/recovery instructions support acceptance.

Coverage: **verified** — Inspected relevant test bodies and assertions for compiled entrypoint startup without source-tree access, daemon/controller protocols for both families, distinct worker identities, controller independence, native-spawn refusal, Vibe transport disposal, asynchronous lookup, failure preservation, recovery and publication. Reviewed supported-client DTO assertions and all supplied compatibility cases, including disclosed failures and focused reruns. The package harness preserves startup identity after terminal reclamation without claiming that a completed worker remains live. Historical executions were assessed at their reported provenance, not treated as fresh executions of the final pin.


Optional verification and advice (nonblocking):

- Optional execution: This reviewer ran no tests, typechecks, builds or deployed smoke. Supplied execution logs were inspected as builder-reported evidence; earlier broad runs do not establish execution of the final pin.
- Optional execution: Full VS Code qualification retains seven disclosed failures; baseline reproductions and focused bundle/privacy reruns were inspected. Full JetBrains test compilation remains blocked by settings-test API errors; the focused 13 review tests have passing supplied results. No full-client green or deployed-smoke claim is made.

Inspected references:

- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/LLD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/PLAN-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/BUILD-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:.insrc/artifacts/TESTS-e4af63128c7cbec2-s1.json`
- `69e74f592d90d89320c16ffa3e8b1f66b8f8064f:design/review-worker-isolation-e4af6312.packet.json`
- `69e74f592d90d89320c16ffa3e8b1f66b8f8064f:.insrc/artifacts/BUILD-e4af63128c7cbec2-s1.json`
- `69e74f592d90d89320c16ffa3e8b1f66b8f8064f:.insrc/artifacts/TESTS-e4af63128c7cbec2-s1.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:design/task-review-final-scope-qualification.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/daemon.md`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:docs/workflow.md`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/vibe-session.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/review-native-guard.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-native-policy.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/review-service.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/review-shell-process.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-daemon.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-production-native.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-clearance-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-worker-rpc.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/helpers/review-shell-host.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/helpers/review-shell-worker.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/tools/__tests__/review-worker-shell.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-spawn-inventory.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-package.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/activity-e2e.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/controller-fixture.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/capacity.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-worker-routing.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-daemon.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/threads/__tests__/review-worker-isolation.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/code-review/task-review/__tests__/transition.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/workflow/review/design-review/__tests__/readers.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/daemon/__tests__/review-native-policy.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/mcp/__tests__/schema-registry.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/cli-review-session.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/agent/providers/__tests__/review-worker-process.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:src/shared/__tests__/process-broker-native.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/review-frame-message.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/review-presenter.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/docs-review-client.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/connections/__tests__/privacy.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/chat-panel.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/chat/__tests__/chat-theme.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:vscode-plugin/src/config/__tests__/per-role.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ArtifactContentTest.kt`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:package.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:tsconfig.json`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:copy-assets.mjs`
- `ef85c2d168518ff9ec115611f9f119798fe69e70:scripts/forbidden-spawn-scan.mjs`
