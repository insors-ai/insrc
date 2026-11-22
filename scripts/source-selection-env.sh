#!/bin/bash
# Copyright (c) Procix Software India. Licensed under the MIT License.
# Source after the launcher's own runtime bootstrap, before executing client code.
# The IDEs call the current packaged installer for this read-only query. Keep
# journal interpretation and executable authentication in the retained issuer.
insrc_print_source_route() {
 local state="$1" expected="$2" bootstrap_node="$NODE_BIN" ROOT='' rc=0 INSRC_SOURCE_RESOLUTION=''
 insrc_resolve_source_launch "$state" "$expected" || rc=$?
 if [ "$rc" -eq 10 ]; then printf '%s\n' null; return 0; fi
 [ "$rc" -eq 0 ] || return "$rc"
 printf '%s' "$INSRC_SOURCE_RESOLUTION" | "$bootstrap_node" --input-type=commonjs -e 'let t="";process.stdin.on("data",b=>t+=b);process.stdin.on("end",()=>{const m=JSON.parse(t);if(typeof m.manager?.root!=="string")throw Error("missing verified manager");process.stdout.write(JSON.stringify({launchRoot:process.argv[1],controlRoot:m.manager.root})+"\n")})' "$ROOT"
}

insrc_resolve_source_launch() {
 local state="$1" journal="$1/source-lifecycle/journal.json" verifier="$1/source-lifecycle/verifier.mjs"
 [ "$("$NODE_BIN" -p 'process.platform')" = linux ] || return 10
 [ -e "$journal" ] || [ -L "$journal" ] || return 10
 local logical resolved present selected_root selected_runtime
 logical=$("$NODE_BIN" --input-type=commonjs -e 'const f=require("fs"),s=f.lstatSync(process.argv[1]);if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o077)||s.size>131072)throw Error("unsafe source journal");const v=JSON.parse(f.readFileSync(process.argv[1]));if(typeof v.installationRoot!=="string")throw Error("invalid source installation identity");process.stdout.write(v.installationRoot+"!")' "$journal") || return 4
 logical=${logical%!}
 if [ -n "${2:-}" ]; then
  "$NODE_BIN" --input-type=commonjs -e 'if(require("fs").realpathSync(process.argv[1])!==process.argv[2])throw Error("requested installation differs from source journal")' "$2" "$logical" || return 4
 fi
 [ -f "$verifier" ] && [ ! -L "$verifier" ] || { printf '%s\n' 'Source issuer verifier missing; obtain the matching authenticated release installer.' >&2; return 4; }
 "$NODE_BIN" --input-type=commonjs -e 'const s=require("fs").lstatSync(process.argv[1]);if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||(s.mode&0o077)||s.size>1048576)throw Error("unsafe source issuer verifier")' "$verifier" || return 4
 resolved=$("$NODE_BIN" "$verifier" installation "$state" "$logical") || return 4
 present=$(printf '%s' "$resolved" | "$NODE_BIN" --input-type=commonjs -e 'let t="";process.stdin.on("data",b=>t+=b);process.stdin.on("end",()=>{const s=JSON.parse(t).state;process.stdout.write(s.selected||s.active||s.outcome?.legacyRoute?"yes":"no")})') || return 4
 [ "$present" = yes ] || return 10
 # resolve verifies the complete source state, compiled pins and owned manager
 # runtime, and rejects pending transactions before returning any launch route.
 resolved=$("$NODE_BIN" "$verifier" resolve "$state" "$logical") || return 4
 INSRC_SOURCE_RESOLUTION="$resolved"
 selected_root=$(printf '%s' "$resolved" | "$NODE_BIN" --input-type=commonjs -e 'let t="";process.stdin.on("data",b=>t+=b);process.stdin.on("end",()=>process.stdout.write(JSON.parse(t).launch.root+"!"))') || return 4
 selected_runtime=$(printf '%s' "$resolved" | "$NODE_BIN" --input-type=commonjs -e 'let t="";process.stdin.on("data",b=>t+=b);process.stdin.on("end",()=>process.stdout.write(JSON.parse(t).launch.runtime+"!"))') || return 4
 ROOT=${selected_root%!}
 NODE_BIN=${selected_runtime%!}
}
