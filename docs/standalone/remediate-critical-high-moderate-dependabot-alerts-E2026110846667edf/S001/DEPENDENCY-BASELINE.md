# Dependabot baseline and candidate resolution

Snapshot from the authenticated GitHub Dependabot API on November 8, 2026. The repository default branch returned by the API was `main`. The locally inspected baseline was `57251e884d1bc1e02e16d93fa25757513715745f` on `v2`. The baseline dependency graph matches the locally available `origin/main` graph for the affected packages.

The root candidate was resolved with npm 10.9.8 on Node 22.23.2 using the repository npm configuration, with lifecycle scripts disabled. The package choices below are design inputs. Build must verify all affected paths with the supported Node 22.22.1 and clean installs.

| Manifest group | Critical | High | Moderate | Low |
| --- | ---: | ---: | ---: | ---: |
| Root lockfile | 1 | 47 | 62 | 8 |
| Archived memory evidence | 0 | 12 | 0 | 0 |
| Total | 1 | 59 | 62 | 8 |

## Root dependency selections

Batch 1 covers daemon transport, parsers and general tooling. Batch 2 covers SMTP and drivers. Batch 3 covers native packages. Installed paths are relative to the package root. A row may match multiple copies or alerts.

| Batch | Package | Baseline | Trial resolved | Baseline parent declaration or root usage | In-scope alerts |
| ---: | --- | --- | --- | --- | --- |
| 2 | `@azure/msal-node` | 5.4.0 | 7.2.1 | @azure/identity ^5.1.0 | #107 |
| 2 | `@grpc/grpc-js` | 1.14.4 | 1.14.7 | etcd3 ^1.8.20 | #82 |
| 1 | `@hono/node-server` | 1.19.14 | 2.1.6 | @modelcontextprotocol/sdk ^1.19.9 | #31, #118 |
| 1 | `@modelcontextprotocol/sdk` | 1.29.0 | 1.32.2 | root ^1.29.0 | #87, #89, #90, #91, #92, #112 |
| 2 | `adm-zip` | 0.5.18 | 0.6.1 | cassandra-driver ~0.5.10 | #8, #41, #50, #65, #67, #68, #69, #70 |
| 1 | `body-parser` | 2.3.0 | 2.4.0 | express ^2.2.1 | #96 |
| 1 | `brace-expansion` | 1.1.16, 2.1.2 | 1.1.21, 2.1.7 | minimatch ^1.1.7, readdir-glob/minimatch ^2.0.1 | #12, #13, #14, #15, #72, #73, #74, #75, #76, #77 |
| 1 | `csv-parse` | 6.2.1 | removed | root ^6.2.1 | #39 |
| 1 | `fast-copy` | 4.0.4 | 4.3.1 | pino-pretty ^4.0.0 | #84 |
| 1 | `fast-uri` | 3.1.3 | 3.1.9 | ajv ^3.0.1 | #10, #16, #35, #36, #37, #38, #53, #80, #98, #100 |
| 1 | `hono` | 4.12.30 | 4.13.17 | @modelcontextprotocol/sdk ^4.11.4 | #25, #28, #30, #42, #43, #44, #83, #88 |
| 1 | `ip-address` | 10.2.0 | 10.7.6 | express-rate-limit ^10.2.0 | #22, #23, #24, #51, #52, #78, #79, #94 |
| 1 | `js-yaml` | 4.3.0 | 4.3.2 | root ^4.1.0 | #26, #45 |
| 2 | `mysql2` | 3.22.6 | 3.24.6 | root ^3.22.2 | #34 |
| 2 | `nodemailer` | 7.0.13 | 10.4.0 | root ^7.0.13 | #2, #4, #5, #6, #7, #40, #47, #48, #49, #55, #66, #71, #93, #101, #102, #103, #108, #109, #110 |
| 1 | `pdfjs-dist` | 5.7.284 | removed | root ^5.5.207 | #27 |
| 1 | `proxy-addr` | 2.0.7 | 2.0.8 | express ^2.0.7 | #85 |
| 1 | `qs` | 6.15.3 | 6.17.1 | body-parser ^6.15.2, express ^6.14.0 | #32, #33, #111 |
| 3 | `sharp` | 0.33.5, 0.34.5 | 0.35.5 | @huggingface/transformers ^0.34.1, @lancedb/lancedb/@huggingface/transformers ^0.33.5 | #9, #46, #86 |
| 3 | `tar` | 7.5.20 | 7.5.22 | @lancedb/lancedb/onnxruntime-node ^7.0.1, onnxruntime-node ^7.0.1 | #11 |
| 1 | `undici` | 7.28.0 | 7.30.2 | root ^7.24.0 | #17, #18, #19, #20, #21, #54, #56, #58, #60, #61, #62, #64, #104, #105, #106, #113, #114, #115, #116, #117 |
| 1 | `uuid` | 8.3.2 | 11.1.1 | exceljs ^8.3.0 | #3 |
| 1 | `zod` | 4.4.3 | 4.6.7 | @mistralai/mistralai ^3.25.0 \|\| ^4.0.0, @modelcontextprotocol/sdk ^3.25 \|\| ^4.0 | #95 |

Cassandra uses 4.10.0 so the patched adm-zip line is inside its declared range. SQL Server retains its existing Tedious driver with Azure Identity 4.14.1 resolving MSAL 7.2.1. The Express path moves to 5.3.0. The locked Node 22 trial resolved a patched copy for every in-scope root package path. The optional 32-bit Windows Sharp 0.35.5 binary declares Node ^20.9.0. macOS and Linux are the required native gates.

## Trial dependency constraints

The dependency ranges below record the verified inputs. Narrow overrides to their affected parents. Drop an override if the selected parent and committed lock already enforce the patched resolution and the validation still passes.

```json
{
  "direct": {
    "@modelcontextprotocol/sdk": "^1.32.2",
    "undici": "^7.30.1",
    "nodemailer": "^10.1.4",
    "js-yaml": "^4.3.2",
    "mysql2": "^3.23.1",
    "cassandra-driver": "^4.10.0"
  },
  "remove": [
    "csv-parse",
    "pdfjs-dist"
  ],
  "overrides": {
    "@modelcontextprotocol/sdk": {
      "express": "^5.3.0",
      "@hono/node-server": "^2.1.3",
      "hono": "^4.13.11",
      "express-rate-limit": "^8.7.3",
      "zod": "^4.6.6"
    },
    "express": {
      "proxy-addr": "^2.0.8",
      "body-parser": "^2.4.0",
      "qs": "^6.16.1"
    },
    "body-parser": {
      "qs": "^6.16.1"
    },
    "@mistralai/mistralai": {
      "zod": "^4.6.6"
    },
    "express-rate-limit": {
      "ip-address": "^10.7.4"
    },
    "cassandra-driver": {
      "adm-zip": "~0.6.1"
    },
    "@huggingface/transformers": {
      "sharp": "~0.35.5"
    },
    "onnxruntime-node": {
      "tar": "^7.5.21"
    },
    "ajv": {
      "fast-uri": "^3.1.9"
    },
    "etcd3": {
      "@grpc/grpc-js": "^1.14.5"
    },
    "tedious": {
      "@azure/identity": "^4.14.1"
    },
    "exceljs": {
      "uuid": "^11.1.1"
    },
    "pino-pretty": {
      "fast-copy": "^4.1.0"
    },
    "minimatch": {
      "brace-expansion@1": "^1.1.21",
      "brace-expansion@2": "^2.1.7"
    }
  }
}
```

## Alert snapshot

Each line retains the GitHub alert number, severity, advisory ID, affected npm range and first patched version. The snapshot is evidence of the queried state on November 8. Repeat the query after deployment to check current tracker state.

| Alert | Severity | Package | Manifest | Advisory | Affected versions | First patched |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | low | `nodemailer` | root | GHSA-c7w3-x93f-qmm8 | `< 8.0.4` | 8.0.4 |
| 2 | medium | `nodemailer` | root | GHSA-vvjj-xcjg-gr5g | `<= 8.0.4` | 8.0.5 |
| 3 | medium | `uuid` | root | GHSA-w5hq-g745-h8pq | `< 11.1.1` | 11.1.1 |
| 4 | high | `nodemailer` | root | GHSA-r7g4-qg5f-qqm2 | `<= 8.0.7` | 8.0.8 |
| 5 | medium | `nodemailer` | root | GHSA-wqvq-jvpq-h66f | `<= 8.0.8` | 8.0.9 |
| 6 | medium | `nodemailer` | root | GHSA-268h-hp4c-crq3 | `<= 8.0.8` | 8.0.9 |
| 7 | high | `nodemailer` | root | GHSA-p6gq-j5cr-w38f | `<= 9.0.0` | 9.0.1 |
| 8 | high | `adm-zip` | root | GHSA-xcpc-8h2w-3j85 | `< 0.6.0` | 0.6.0 |
| 9 | high | `sharp` | root | GHSA-f88m-g3jw-g9cj | `< 0.35.0` | 0.35.0 |
| 10 | high | `fast-uri` | root | GHSA-v2hh-gcrm-f6hx | `>= 3.0.0, <= 3.1.3` | 3.1.4 |
| 11 | high | `tar` | root | GHSA-r292-9mhp-454m | `<= 7.5.20` | 7.5.21 |
| 12 | high | `brace-expansion` | root | GHSA-mh99-v99m-4gvg | `>= 2.0.0, < 2.1.3` | 2.1.3 |
| 13 | high | `brace-expansion` | root | GHSA-mh99-v99m-4gvg | `< 1.1.17` | 1.1.17 |
| 14 | high | `brace-expansion` | root | GHSA-rgw5-rvv9-x895 | `< 1.1.18` | 1.1.18 |
| 15 | high | `brace-expansion` | root | GHSA-rgw5-rvv9-x895 | `>= 2.0.0, < 2.1.4` | 2.1.4 |
| 16 | high | `fast-uri` | root | GHSA-7p8r-x3mc-p8w7 | `>= 3.0.0, < 3.1.5` | 3.1.5 |
| 17 | high | `undici` | root | GHSA-4cwx-7wf7-3272 | `>= 7.0.0, < 7.29.0` | 7.29.0 |
| 18 | medium | `undici` | root | GHSA-8xcm-r25x-g524 | `>= 7.0.0, < 7.29.0` | 7.29.0 |
| 19 | medium | `undici` | root | GHSA-v3r7-h72x-cjcm | `>= 7.0.0, < 7.29.0` | 7.29.0 |
| 20 | medium | `undici` | root | GHSA-jr45-8vmc-qm54 | `>= 7.0.0, < 7.29.0` | 7.29.0 |
| 21 | medium | `undici` | root | GHSA-m8rv-5g2x-5cg5 | `>= 7.0.0, < 7.29.0` | 7.29.0 |
| 22 | medium | `ip-address` | root | GHSA-22jq-vg5j-6vgg | `>= 10.1.1, <= 10.2.0` | 10.2.1 |
| 23 | medium | `ip-address` | root | GHSA-4xrf-jv44-h6hh | `>= 10.1.1, <= 10.2.1` | 10.2.2 |
| 24 | high | `ip-address` | root | GHSA-mwp4-54f8-5fhr | `<= 10.3.0` | 10.3.1 |
| 25 | medium | `hono` | root | GHSA-8j4g-w8fx-2239 | `< 4.12.34` | 4.12.34 |
| 26 | high | `js-yaml` | root | GHSA-5p4m-2wfm-xmqj | `>= 4.0.0, < 4.3.1` | 4.3.1 |
| 27 | high | `pdfjs-dist` | root | GHSA-hq66-cqwq-w95j | `>= 5.6.83, < 6.2.108` | 6.2.108 |
| 28 | medium | `hono` | root | GHSA-54fx-42gc-7vw4 | `>= 4.12.0, < 4.12.34` | 4.12.34 |
| 29 | low | `hono` | root | GHSA-79qm-7rj5-m7r9 | `>= 4.7.0, < 4.12.34` | 4.12.34 |
| 30 | medium | `hono` | root | GHSA-f23p-vx2j-j53r | `>= 3.8.0, < 4.12.34` | 4.12.34 |
| 31 | medium | `@hono/node-server` | root | GHSA-frvp-7c67-39w9 | `< 1.19.15` | 1.19.15 |
| 32 | medium | `qs` | root | GHSA-4mjr-xmp4-gh2g | `>= 2.2.5, < 6.16.0` | 6.16.0 |
| 33 | medium | `qs` | root | GHSA-x5fp-wj9c-mxmx | `>= 6.14.2, <= 6.15.3` | 6.16.0 |
| 34 | medium | `mysql2` | root | GHSA-rgwj-5xj2-c3m3 | `<= 3.23.0` | 3.23.1 |
| 35 | high | `fast-uri` | root | GHSA-jqff-g426-hqxp | `>= 3.0.0, < 3.1.6` | 3.1.6 |
| 36 | high | `fast-uri` | root | GHSA-fph4-wmhf-6fwf | `>= 3.1.2, < 3.1.6` | 3.1.6 |
| 37 | high | `fast-uri` | root | GHSA-f65p-4m7j-42xc | `>= 3.0.0, < 3.1.6` | 3.1.6 |
| 38 | high | `fast-uri` | root | GHSA-5jgf-p345-68v8 | `>= 3.1.3, < 3.1.6` | 3.1.6 |
| 39 | medium | `csv-parse` | root | GHSA-8cw4-87c7-c6xx | `< 7.0.2` | 7.0.2 |
| 40 | medium | `nodemailer` | root | GHSA-8m3c-c648-2xjj | `<= 9.1.0` | 9.1.1 |
| 41 | medium | `adm-zip` | root | GHSA-vwc7-r8mq-g2x9 | `>= 0.5.9, <= 0.6.0` | Unspecified |
| 42 | medium | `hono` | root | GHSA-crvj-82cr-hjcx | `< 4.13.5` | 4.13.5 |
| 43 | medium | `hono` | root | GHSA-g6gw-c38x-mqfc | `< 4.13.5` | 4.13.5 |
| 44 | medium | `hono` | root | GHSA-gqvv-2mrq-wpjv | `< 4.13.5` | 4.13.5 |
| 45 | high | `js-yaml` | root | GHSA-2883-xcg3-v3hh | `>= 4.0.0, < 4.3.2` | 4.3.2 |
| 46 | high | `sharp` | root | GHSA-rgj7-g3m4-5g8c | `< 0.35.4` | 0.35.4 |
| 47 | medium | `nodemailer` | root | GHSA-cc9r-2j5m-2m83 | `>= 6.9.16, < 9.1.0` | 9.1.0 |
| 48 | high | `nodemailer` | root | GHSA-2x7j-588g-ccc2 | `< 9.1.0` | 9.1.0 |
| 49 | medium | `nodemailer` | root | GHSA-wmmp-3585-3rmp | `< 9.1.0` | 9.1.0 |
| 50 | high | `adm-zip` | root | GHSA-7q85-xj36-vmfc | `< 0.6.1` | 0.6.1 |
| 51 | medium | `ip-address` | root | GHSA-2vr4-cq9g-pvrc | `>= 10.2.0, <= 10.5.0` | 10.5.1 |
| 52 | medium | `ip-address` | root | GHSA-rpw4-54j3-4h4q | `<= 10.5.0` | 10.5.1 |
| 53 | high | `fast-uri` | root | GHSA-qw65-cvwx-89v3 | `>= 3.0.0, < 3.1.7` | 3.1.7 |
| 54 | medium | `undici` | root | GHSA-3wwx-pv8p-q78v | `>= 7.28.0, < 7.29.1` | 7.29.1 |
| 55 | medium | `nodemailer` | root | GHSA-6vj9-mwq6-2f5v | `>= 5.0.0, < 10.0.2` | 10.0.2 |
| 56 | medium | `undici` | root | GHSA-rx4f-c7p8-82vq | `>= 7.0.0, < 7.29.1` | 7.29.1 |
| 57 | low | `undici` | root | GHSA-8436-99hf-9mmv | `>= 7.0.0, < 7.29.1` | 7.29.1 |
| 58 | high | `undici` | root | GHSA-w293-vg96-wgc3 | `>= 7.24.1, < 7.29.1` | 7.29.1 |
| 59 | low | `undici` | root | GHSA-2gqq-gqf2-x968 | `>= 7.1.0, < 7.29.1` | 7.29.1 |
| 60 | medium | `undici` | root | GHSA-2jfj-6hjv-fm6j | `>= 7.0.0, < 7.29.1` | 7.29.1 |
| 61 | medium | `undici` | root | GHSA-3xpg-4rpp-hhhm | `>= 7.15.0, < 7.29.1` | 7.29.1 |
| 62 | high | `undici` | root | GHSA-rfgv-xxqx-mfg5 | `>= 7.0.0, < 7.29.1` | 7.29.1 |
| 63 | low | `undici` | root | GHSA-r53p-7pc4-xj5r | `>= 7.0.0, < 7.29.1` | 7.29.1 |
| 64 | medium | `undici` | root | GHSA-pmjh-fq2x-6v4x | `>= 7.11.0, < 7.29.1` | 7.29.1 |
| 65 | high | `adm-zip` | root | GHSA-j5f4-cc29-5x44 | `<= 0.6.0` | 0.6.1 |
| 66 | medium | `nodemailer` | root | GHSA-8vvx-rff5-p5rq | `< 10.0.2` | 10.0.2 |
| 67 | high | `adm-zip` | root | GHSA-rcw4-f5rp-g42v | `<= 0.6.0` | 0.6.1 |
| 68 | high | `adm-zip` | root | GHSA-8238-w5pm-2374 | `<= 0.6.0` | 0.6.1 |
| 69 | medium | `adm-zip` | root | GHSA-c6fg-446q-cg94 | `<= 0.6.0` | 0.6.1 |
| 70 | medium | `adm-zip` | root | GHSA-p634-w6r4-rjp2 | `<= 0.6.0` | 0.6.1 |
| 71 | high | `nodemailer` | root | GHSA-v53p-9fqp-m79j | `<= 10.0.5` | 10.0.6 |
| 72 | high | `brace-expansion` | root | GHSA-6j4f-fj2g-mc7p | `>= 2.0.0, < 2.1.5` | 2.1.5 |
| 73 | high | `brace-expansion` | root | GHSA-6j4f-fj2g-mc7p | `< 1.1.19` | 1.1.19 |
| 74 | high | `brace-expansion` | root | GHSA-qhr7-859c-m2p7 | `>= 2.0.0, < 2.1.6` | 2.1.6 |
| 75 | high | `brace-expansion` | root | GHSA-qhr7-859c-m2p7 | `< 1.1.20` | 1.1.20 |
| 76 | medium | `brace-expansion` | root | GHSA-q2hr-2g5m-vwhr | `>= 2.0.0, < 2.1.7` | 2.1.7 |
| 77 | medium | `brace-expansion` | root | GHSA-q2hr-2g5m-vwhr | `< 1.1.21` | 1.1.21 |
| 78 | medium | `ip-address` | root | GHSA-h3mg-xc3c-68pw | `<= 10.7.0` | 10.7.1 |
| 79 | medium | `ip-address` | root | GHSA-j6r3-76f7-8jcv | `<= 10.7.0` | 10.7.1 |
| 80 | medium | `fast-uri` | root | GHSA-hrr3-gc8f-f4qj | `>= 3.0.0, < 3.1.8` | 3.1.8 |
| 81 | low | `@grpc/grpc-js` | root | GHSA-f596-whhp-79r4 | `>= 1.14.0, < 1.14.5` | 1.14.5 |
| 82 | high | `@grpc/grpc-js` | root | GHSA-m9gg-hp2v-232j | `>= 1.14.0, < 1.14.5` | 1.14.5 |
| 83 | medium | `hono` | root | GHSA-hxh3-vqpv-xpqv | `< 4.13.7` | 4.13.7 |
| 84 | medium | `fast-copy` | root | GHSA-jggr-w7fw-pc2j | `>= 4.0.0, < 4.1.0` | 4.1.0 |
| 85 | critical | `proxy-addr` | root | GHSA-jqcg-44mw-7w3h | `>= 1.1.0, < 2.0.8` | 2.0.8 |
| 86 | high | `sharp` | root | GHSA-wq5f-xc86-pv6w | `< 0.35.5` | 0.35.5 |
| 87 | high | `@modelcontextprotocol/sdk` | root | GHSA-6qxp-vccf-f47h | `>= 1.12.0, < 1.31.0` | 1.31.0 |
| 88 | medium | `hono` | root | GHSA-5r4p-p66f-jhc7 | `>= 4.12.4, < 4.13.11` | 4.13.11 |
| 89 | medium | `@modelcontextprotocol/sdk` | root | GHSA-6prh-2h8m-c8cw | `< 1.32.0` | 1.32.0 |
| 90 | high | `@modelcontextprotocol/sdk` | root | GHSA-22jm-h49p-29qw | `>= 1.24.0, < 1.32.0` | 1.32.0 |
| 91 | medium | `@modelcontextprotocol/sdk` | root | GHSA-rvq5-wwqv-78pq | `>= 1.6.0, < 1.32.0` | 1.32.0 |
| 92 | high | `@modelcontextprotocol/sdk` | root | GHSA-46jr-4wx8-v453 | `>= 1.3.0, < 1.32.0` | 1.32.0 |
| 93 | medium | `nodemailer` | root | GHSA-39m8-27wv-hr27 | `>= 3.0.0, <= 10.0.9` | 10.0.10 |
| 94 | medium | `ip-address` | root | GHSA-rxp7-6hxx-x8q5 | `<= 10.7.3` | 10.7.4 |
| 95 | high | `zod` | root | GHSA-mrhx-c7xc-m3w5 | `< 4.6.6` | 4.6.6 |
| 96 | high | `body-parser` | root | GHSA-27r3-jxmh-p828 | `>= 2.0.0, < 2.4.0` | 2.4.0 |
| 97 | low | `fast-uri` | root | GHSA-333x-w4r6-6crp | `>= 3.0.0, < 3.1.9` | 3.1.9 |
| 98 | medium | `fast-uri` | root | GHSA-wjr9-j795-jxcr | `>= 3.1.3, < 3.1.9` | 3.1.9 |
| 99 | low | `fast-uri` | root | GHSA-xhq7-xmqj-769h | `>= 3.0.0, < 3.1.9` | 3.1.9 |
| 100 | medium | `fast-uri` | root | GHSA-w74x-v6f9-j3xg | `>= 3.0.0, < 3.1.9` | 3.1.9 |
| 101 | medium | `nodemailer` | root | GHSA-85x2-q946-cp5h | `>= 3.0.0, < 10.1.4` | 10.1.4 |
| 102 | medium | `nodemailer` | root | GHSA-m943-m63m-w62w | `>= 3.0.0, < 10.1.4` | 10.1.4 |
| 103 | medium | `nodemailer` | root | GHSA-8c8m-p3m8-cjg8 | `>= 3.0.0, < 10.1.4` | 10.1.4 |
| 104 | medium | `undici` | root | GHSA-f72v-6w45-q472 | `>= 7.15.0, < 7.30.1` | 7.30.1 |
| 105 | medium | `undici` | root | GHSA-4qv8-2p9j-2685 | `>= 7.0.0, < 7.30.1` | 7.30.1 |
| 106 | high | `undici` | root | GHSA-xjj6-f33q-929c | `>= 7.18.0, < 7.30.1` | 7.30.1 |
| 107 | high | `@azure/msal-node` | root | GHSA-xcx6-jx8p-x3h5 | `>= 5.0.0-beta.0, < 7.1.0` | 7.1.0 |
| 108 | medium | `nodemailer` | root | GHSA-4g23-2xm8-66gc | `>= 3.0.0, <= 10.0.9` | 10.0.10 |
| 109 | medium | `nodemailer` | root | GHSA-g73g-hqqh-jr95 | `>= 3.0.0, <= 10.0.12` | 10.0.13 |
| 110 | medium | `nodemailer` | root | GHSA-4ffr-jq9g-5ffx | `>= 3.0.0, <= 10.0.12` | 10.0.13 |
| 111 | medium | `qs` | root | GHSA-6pq8-jhm2-2vcw | `>= 6.7.0, <= 6.16.0` | 6.16.1 |
| 112 | high | `@modelcontextprotocol/sdk` | root | GHSA-f897-62hf-6gxq | `>= 1.10.0, < 1.30.1` | 1.30.1 |
| 113 | medium | `undici` | root | GHSA-55wc-3pg8-jfw6 | `>= 7.15.0, < 7.30.1` | 7.30.1 |
| 114 | medium | `undici` | root | GHSA-9fm3-97px-rjf6 | `>= 7.0.0, < 7.30.1` | 7.30.1 |
| 115 | high | `undici` | root | GHSA-qrxm-fqhp-jwvm | `>= 7.0.0, < 7.30.1` | 7.30.1 |
| 116 | high | `undici` | root | GHSA-2m5v-pch6-74hx | `>= 7.0.0, < 7.30.1` | 7.30.1 |
| 117 | high | `undici` | root | GHSA-4w7w-5xrc-9h26 | `>= 7.0.0, < 7.30.1` | 7.30.1 |
| 118 | medium | `@hono/node-server` | root | GHSA-rmxm-3fg6-px4f | `>= 1.19.10, < 2.1.3` | 2.1.3 |
| 120 | high | `sharp` | archive 4 | GHSA-f88m-g3jw-g9cj | `< 0.35.0` | 0.35.0 |
| 121 | high | `sharp` | archive 4 | GHSA-rgj7-g3m4-5g8c | `< 0.35.4` | 0.35.4 |
| 122 | high | `sharp` | archive 4 | GHSA-wq5f-xc86-pv6w | `< 0.35.5` | 0.35.5 |
| 123 | high | `sharp` | archive 1 | GHSA-f88m-g3jw-g9cj | `< 0.35.0` | 0.35.0 |
| 124 | high | `sharp` | archive 1 | GHSA-rgj7-g3m4-5g8c | `< 0.35.4` | 0.35.4 |
| 125 | high | `sharp` | archive 1 | GHSA-wq5f-xc86-pv6w | `< 0.35.5` | 0.35.5 |
| 126 | high | `sharp` | archive 2 | GHSA-f88m-g3jw-g9cj | `< 0.35.0` | 0.35.0 |
| 127 | high | `sharp` | archive 2 | GHSA-rgj7-g3m4-5g8c | `< 0.35.4` | 0.35.4 |
| 128 | high | `sharp` | archive 2 | GHSA-wq5f-xc86-pv6w | `< 0.35.5` | 0.35.5 |
| 129 | high | `sharp` | archive 3 | GHSA-f88m-g3jw-g9cj | `< 0.35.0` | 0.35.0 |
| 130 | high | `sharp` | archive 3 | GHSA-rgj7-g3m4-5g8c | `< 0.35.4` | 0.35.4 |
| 131 | high | `sharp` | archive 3 | GHSA-wq5f-xc86-pv6w | `< 0.35.5` | 0.35.5 |

1. `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/package-lock.json`
2. `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/package-lock.json`
3. `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t17-linux/project-memory-linux-node22-0990b423e1036ec1d2bf1783f20f40b62de77da3/package-lock.json`
4. `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/package-lock.json`

The four archived lockfiles are qualification evidence. Preserve the original bytes and provenance. Review any tracker disposition for those paths separately. The eight low alerts are outside the required remediation gate.

For alert 41, GitHub provides no first patched version and lists 0.6.0 as the top of the affected range. Require an overwrite-enabled destination symlink regression on both baseline and 0.6.1 before attributing the runtime fix. Recheck tracker status separately.

## Standalone package delivery

- Use the upstream npm release of `@lancedb/lancedb` 0.40.0. Its tarball is `https://registry.npmjs.org/@lancedb/lancedb/-/lancedb-0.40.0.tgz` and the integrity in the existing lockfile is `sha512-hCvk6y/gHARQ++NarvguEmX02Hm2zJAUJQgf1Sq8KznBKjI21xsK5YYzw2L0eUArDWxPjtLl4kD329ymLMqLew==`. Verify the archive against that value before extracting into a clean release staging directory.
- Derive a private storage-only copy by removing the two optional npm entries for `@huggingface/transformers` and `openai` from its manifest. Keep its package identity, 0.40.0 version, JavaScript, types, provenance, license notices, required dependencies and original platform binding versions. Include the Apache-2.0 license and upstream notices in the release.
- The release staging manifest for `@insrc/project-memory` uses `file:vendor/lancedb` for the SDK and lists `@lancedb/lancedb` in `bundledDependencies`. Install in staging with npm's install-links enabled and optional packages omitted for packing. Declare the SDK's original version-pinned native platform packages as optional dependencies of the staged memory package. The published tarball carries the private SDK under its bundled dependency path. The staging vendor directory stays outside the tarball. A consumer installs the usual memory tarball without another registry or any host-level override, and npm resolves the compatible native binding for that consumer.
- The stage that creates the standalone release tarball owns this manifest transformation. Extend the existing packed consumer qualification to use that same stage and inspect the packed manifest, SDK integrity and clean consumer graph. Switch independent qualification to consume that tarball so it checks the graph external consumers receive. Keep the SDK import specifier and memory's existing exports. The daemon keeps its direct local Transformers embedding dependency and patches Sharp in its own graph.
- A disposable proof on macOS arm64, Node 22.23.2 and npm 10.9.8 installed the bundled storage-only SDK from a local package tarball without the staging vendor directory. The consumer graph contained no Sharp, Transformers or ONNX Runtime. Opening an empty store through the actual 0.40.0 native binding succeeded. A separate Linux x64 lock-only resolution retained the official Linux platform dependency. Real Linux loading, the final memory artifact, Node 22.22.1 and store compatibility remain build acceptance checks.
- A separate producer resolved patched Sharp 0.35.5 in its shrinkwrap. Its clean npm consumer resolved Sharp 0.33.5 from the packed archive. The bundled SDK proof avoids that dependency range conflict.

## ZIP symlink regression probe

On Node 22.23.2, use a separate temporary destination and sentinel for each of the three extraction calls. Create a regular ZIP entry named `data.txt` with bytes distinct from the sentinel. Before extraction, place a destination symlink named `data.txt` pointing to a sentinel outside the destination with mode 0600. Call `extractAllTo`, `extractAllToAsync`, and `extractEntryTo` with overwrite and permission preservation enabled. Pass the entry object to the single-entry API. Require unchanged sentinel bytes and mode regardless of whether the patched API throws or skips. The installed 0.5.18 baseline overwrote the sentinel and set mode 0644 in all three cases. The upstream 0.6.1 tarball preserved the bytes and mode 0600 in all three cases.

## Evidence boundary for design and release

The approved ISSUE fixes the historical scope for this design. A second authenticated query to the same GitHub REST endpoint returned the same 130 open records as the original query. The two responses matched on alert ID, status, timestamps, dependency and manifest, advisory IDs, severity, affected version range and first patched version. The adjacent `DEPENDABOT-SNAPSHOT.json` contains the selected API fields sorted by alert number. It contains no authentication headers or credentials. Its SHA-256 is `985cfe3e75aa98047cb27935acfd6a157f9defe46712ab9b501a08532ac9028c`.

The design can be checked against this historical scope from the repository alone. Recompute totals and affected-version comparisons from the captured records rather than relying on the rendered counts. Neither the historical data nor successful dependency resolution establishes that GitHub has closed any alert. At release, use a fresh authenticated query after the default-branch dependency scan, compare the snapshot's alert IDs against their current states and record any open result with its manifest and reason. If GitHub cannot be reached at that point, the tracker reconciliation stays pending.
