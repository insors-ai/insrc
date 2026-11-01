import java.net.URI;
import java.util.regex.Pattern;
class FinalEndpointCheck {
 static boolean accepts(String endpoint) {
  try {
   int schemeEnd=endpoint.indexOf(':');
   int authorityStart=endpoint.startsWith("//",schemeEnd+1)?schemeEnd+3:-1;
   int tailStart=authorityStart>=0?endpoint.length():schemeEnd+1;
   if(authorityStart>=0)for(int i=authorityStart;i<endpoint.length();i++){if("/?#".indexOf(endpoint.charAt(i))>=0){tailStart=i;break;}}
   String authority=authorityStart>=0?endpoint.substring(authorityStart,tailStart):"";
   if(authority.indexOf('@')>=0)return false;
   String tail=Pattern.compile("[%\\u0000-\\u0020<>\"{}|\\\\^`\\[\\]]").matcher(endpoint.substring(tailStart)).replaceAll(m->"%"+String.format("%02X",(int)m.group().charAt(0)));
   URI uri=new URI(endpoint.substring(0,tailStart)+tail);
   return uri.getScheme()!=null&&uri.getRawUserInfo()==null;
  }catch(Exception e){return false;}
 }
 public static void main(String[] args){
  for(String s:new String[]{"https:user:pw@host/","https:///user:pw@host","https:\\\\user:pw@host","https://host/#a#b","https://host/?q=\u00a0"})System.out.println(s+" => Kotlin-equivalent="+accepts(s));
 }
}
