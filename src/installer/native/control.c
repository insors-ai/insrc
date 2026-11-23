/* Minimal Node-API v8 control adapter. Built by publishers/developers, never at load time. */
#define NAPI_VERSION 8
#include <node_api.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <sddl.h>
#include <aclapi.h>
typedef wchar_t pathchar;
typedef struct { HANDLE fd; pathchar *path; } lease;
#define CLOSED INVALID_HANDLE_VALUE
#else
#include <sys/file.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
typedef char pathchar;
typedef struct { int fd; pathchar *path; } lease;
#define CLOSED -1
#endif
static napi_value fail(napi_env e, const char *code, const char *message) { napi_throw_error(e, code, message); return NULL; }
static napi_value boolean(napi_env e, int b) { napi_value v; napi_get_boolean(e, b, &v); return v; }
static napi_value nothing(napi_env e) { napi_value v; napi_get_undefined(e, &v); return v; }
static pathchar *patharg(napi_env e, napi_value v) {
  size_t n=0;
#ifdef _WIN32
  if (napi_get_value_string_utf16(e,v,NULL,0,&n)!=napi_ok || !n || n>32760) return NULL;
  pathchar *p=calloc(n+1,sizeof(pathchar));
  if (!p) return NULL;
  napi_get_value_string_utf16(e,v,(char16_t*)p,n+1,&n);
  if (wcslen(p)!=n) { free(p); return NULL; }
#else
  if (napi_get_value_string_utf8(e,v,NULL,0,&n)!=napi_ok || !n || n>16384) return NULL;
  pathchar *p=calloc(n+1,1);
  if (!p) return NULL;
  napi_get_value_string_utf8(e,v,p,n+1,&n);
  if (strlen(p)!=n) { free(p); return NULL; }
#endif
  return p;
}
static void release(lease *l) {
  if (!l || l->fd==CLOSED) return;
#ifdef _WIN32
  OVERLAPPED o={0}; UnlockFileEx(l->fd,0,1,0,&o); CloseHandle(l->fd);
#else
  /* close releases flock; no unlink, PID or lease-age interpretation. */
  close(l->fd);
#endif
  l->fd=CLOSED;
}
static void finalize(napi_env e, void *data, void *hint) { (void)e; (void)hint; lease *l=data; release(l); free(l->path); free(l); }
#ifdef _WIN32
static PSID ownsid(void) {
  HANDLE token; DWORD n=0;
  if (!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token)) return NULL;
  GetTokenInformation(token,TokenUser,NULL,0,&n);
  TOKEN_USER *u=malloc(n); PSID sid=NULL;
  if (u && GetTokenInformation(token,TokenUser,u,n,&n)) {
    DWORD bytes=GetLengthSid(u->User.Sid); sid=malloc(bytes);
    if (sid && !CopySid(bytes,sid,u->User.Sid)) { free(sid); sid=NULL; }
  }
  free(u); CloseHandle(token); return sid;
}
static int private_path(pathchar *path) {
  PSID sid=ownsid(); if (!sid) return 0;
  EXPLICIT_ACCESSW a={0}; a.grfAccessPermissions=GENERIC_ALL;
  a.grfAccessMode=SET_ACCESS; a.grfInheritance=SUB_CONTAINERS_AND_OBJECTS_INHERIT;
  a.Trustee.TrusteeForm=TRUSTEE_IS_SID; a.Trustee.TrusteeType=TRUSTEE_IS_USER; a.Trustee.ptstrName=sid;
  PACL acl=NULL; DWORD result=SetEntriesInAclW(1,&a,NULL,&acl);
  if (result==ERROR_SUCCESS) result=SetNamedSecurityInfoW(path,SE_FILE_OBJECT,DACL_SECURITY_INFORMATION|PROTECTED_DACL_SECURITY_INFORMATION,NULL,NULL,acl,NULL);
  if (acl) LocalFree(acl); free(sid); return result==ERROR_SUCCESS;
}
#endif
static int anchor(lease *l) {
  if (!l || l->fd==CLOSED) return 0;
#ifdef _WIN32
  BY_HANDLE_FILE_INFORMATION a,b;
  HANDLE other=CreateFileW(l->path,FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE,NULL,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,NULL);
  if (other==INVALID_HANDLE_VALUE) return 0;
  int ok=GetFileInformationByHandle(l->fd,&a) && GetFileInformationByHandle(other,&b)
    && !(b.dwFileAttributes&(FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_DIRECTORY))
    && a.dwVolumeSerialNumber==b.dwVolumeSerialNumber && a.nFileIndexHigh==b.nFileIndexHigh && a.nFileIndexLow==b.nFileIndexLow;
  CloseHandle(other); return ok;
#else
  struct stat a,b;
  return fstat(l->fd,&a)==0 && lstat(l->path,&b)==0 && S_ISREG(b.st_mode) && a.st_nlink==1
    && a.st_dev==b.st_dev && a.st_ino==b.st_ino;
#endif
}
static napi_value acquire(napi_env e, napi_callback_info info) {
  size_t n=1; napi_value args[1]; napi_get_cb_info(e,info,&n,args,NULL,NULL);
  pathchar *p=n==1?patharg(e,args[0]):NULL;
  if (!p) return fail(e,"path-invalid","Expected lock path");
  lease *l=calloc(1,sizeof(lease)); if (!l) { free(p); return fail(e,"native-unavailable","Allocation failed"); }
  l->path=p; l->fd=CLOSED;
#ifdef _WIN32
  l->fd=CreateFileW(p,GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,NULL,OPEN_ALWAYS,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,NULL);
  if (l->fd==INVALID_HANDLE_VALUE) { finalize(e,l,NULL); return fail(e,"lock-invalid","Cannot open persistent lock"); }
  BY_HANDLE_FILE_INFORMATION st;
  if (!GetFileInformationByHandle(l->fd,&st) || (st.dwFileAttributes&(FILE_ATTRIBUTE_REPARSE_POINT|FILE_ATTRIBUTE_DIRECTORY)) || st.nNumberOfLinks!=1 || !private_path(p)) {
    finalize(e,l,NULL); return fail(e,"lock-invalid","Unsafe lock file");
  }
  OVERLAPPED o={0};
  if (!LockFileEx(l->fd,LOCKFILE_EXCLUSIVE_LOCK|LOCKFILE_FAIL_IMMEDIATELY,0,1,0,&o)) {
    DWORD err=GetLastError(); finalize(e,l,NULL); return fail(e,err==ERROR_LOCK_VIOLATION?"busy":"lock-unavailable","Cannot acquire operation lock");
  }
#else
  l->fd=open(p,O_CREAT|O_RDWR|O_CLOEXEC|O_NOFOLLOW,0600);
  struct stat st;
  if (l->fd<0 || fstat(l->fd,&st) || !S_ISREG(st.st_mode) || st.st_nlink!=1 || st.st_uid!=geteuid() || (st.st_mode&077)!=0) {
    finalize(e,l,NULL); return fail(e,"lock-invalid","Unsafe or inaccessible lock file");
  }
  if (flock(l->fd,LOCK_EX|LOCK_NB)) { int err=errno; finalize(e,l,NULL); return fail(e,err==EWOULDBLOCK?"busy":"lock-unavailable","Cannot acquire operation lock"); }
#endif
  if (!anchor(l)) { finalize(e,l,NULL); return fail(e,"lock-invalid","Lock anchor changed"); }
  napi_value v; if (napi_create_external(e,l,finalize,NULL,&v)!=napi_ok) { finalize(e,l,NULL); return fail(e,"native-unavailable","Cannot retain lock"); } return v;
}
static lease *handle(napi_env e,napi_value v) { lease *l=NULL; if(napi_get_value_external(e,v,(void**)&l)!=napi_ok) return NULL; return l; }
static napi_value held(napi_env e,napi_callback_info info) { size_t n=1; napi_value a[1]; napi_get_cb_info(e,info,&n,a,NULL,NULL); return boolean(e,n==1 && anchor(handle(e,a[0]))); }
static napi_value close_lock(napi_env e,napi_callback_info info) { size_t n=1; napi_value a[1]; napi_get_cb_info(e,info,&n,a,NULL,NULL); if(n==1) release(handle(e,a[0])); return nothing(e); }
static napi_value replace(napi_env e,napi_callback_info info) {
  size_t n=3; napi_value a[3]; napi_get_cb_info(e,info,&n,a,NULL,NULL);
  if(n!=3 || !anchor(handle(e,a[0]))) return fail(e,"lock-lost","Atomic replacement requires live lock");
  pathchar *from=patharg(e,a[1]),*to=patharg(e,a[2]);
  if(!from||!to) { free(from);free(to);return fail(e,"path-invalid","Expected replacement paths"); }
  int ok;
#ifdef _WIN32
  DWORD attrs=GetFileAttributesW(to);
  if(attrs==INVALID_FILE_ATTRIBUTES && GetLastError()==ERROR_FILE_NOT_FOUND) ok=MoveFileExW(from,to,MOVEFILE_WRITE_THROUGH);
  else ok=ReplaceFileW(to,from,NULL,0,NULL,NULL); /* WRITE_THROUGH is unsupported for ReplaceFile. */
#else
  ok=rename(from,to)==0;
#endif
  free(from);free(to); if(!ok) return fail(e,"replace-uncertain","Atomic replacement failed; inspect authoritative state before proceeding"); return nothing(e);
}
static napi_value protect(napi_env e,napi_callback_info info) {
  size_t n=1;napi_value a[1];napi_get_cb_info(e,info,&n,a,NULL,NULL);pathchar *p=n==1?patharg(e,a[0]):NULL;
  if(!p)return fail(e,"path-invalid","Expected private directory");
#ifdef _WIN32
  DWORD attrs=GetFileAttributesW(p); int ok=attrs!=INVALID_FILE_ATTRIBUTES && (attrs&FILE_ATTRIBUTE_DIRECTORY) && !(attrs&FILE_ATTRIBUTE_REPARSE_POINT) && private_path(p);
#else
  struct stat s; int ok=lstat(p,&s)==0 && S_ISDIR(s.st_mode) && s.st_uid==geteuid() && chmod(p,0700)==0;
#endif
  free(p);if(!ok)return fail(e,"permissions-invalid","Cannot restrict installer control directory");return nothing(e);
}
static napi_value sid(napi_env e,napi_callback_info info) {
  (void)info;
#ifdef _WIN32
  PSID s=ownsid(); LPWSTR text=NULL;
  if(!s || !ConvertSidToStringSidW(s,&text)) { free(s);return fail(e,"user-identity-unavailable","Cannot resolve own SID"); }
  napi_value v;napi_create_string_utf16(e,(char16_t*)text,NAPI_AUTO_LENGTH,&v);LocalFree(text);free(s);return v;
#else
  return fail(e,"target-unsupported","SID lookup requires Windows");
#endif
}
static napi_value local(napi_env e,napi_callback_info info) {
  size_t n=1;napi_value a[1];napi_get_cb_info(e,info,&n,a,NULL,NULL);pathchar *p=n==1?patharg(e,a[0]):NULL;
  if(!p)return fail(e,"path-invalid","Expected local path");
#ifdef _WIN32
  WCHAR root[MAX_PATH], fs[MAX_PATH];
  int ok=GetVolumePathNameW(p,root,MAX_PATH);
  UINT drive=ok?GetDriveTypeW(root):DRIVE_UNKNOWN;
  ok=ok && (drive==DRIVE_FIXED || drive==DRIVE_REMOVABLE) && GetVolumeInformationW(root,NULL,0,NULL,NULL,NULL,fs,MAX_PATH) && (!_wcsicmp(fs,L"NTFS") || !_wcsicmp(fs,L"ReFS"));
#else
  int ok=0; /* POSIX uses the explicit statfs family allowlist in location.ts. */
#endif
  free(p);return boolean(e,ok);
}
static napi_value init(napi_env e,napi_value exports) {
  napi_property_descriptor props[]={
    {"acquire",NULL,acquire,NULL,NULL,NULL,napi_default,NULL}, {"held",NULL,held,NULL,NULL,NULL,napi_default,NULL},
    {"close",NULL,close_lock,NULL,NULL,NULL,napi_default,NULL}, {"replace",NULL,replace,NULL,NULL,NULL,napi_default,NULL},
    {"protect",NULL,protect,NULL,NULL,NULL,napi_default,NULL}, {"userSid",NULL,sid,NULL,NULL,NULL,napi_default,NULL},
    {"localVolume",NULL,local,NULL,NULL,NULL,napi_default,NULL}
  };
  napi_define_properties(e,exports,sizeof(props)/sizeof(props[0]),props);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
