/* Makes admin.html more resilient: if the main worker address fails to connect,
   it retries on the backup address (same list index.html uses), with a timeout,
   and adds a short reason to the "Couldn't connect" message. Load BEFORE the main script. */
(function(){
var A="https://laya-site.manilimelight769.workers.dev",B="https://laya-relay.pages.dev";
var realFetch=window.fetch.bind(window);
function firstBase(){try{var b=localStorage.getItem("layaBase");if(b===A||b===B)return b}catch(e){}return A}
function tryOnce(base,path,init){
  var ctl=typeof AbortController==="function"?new AbortController():null,tm=0;
  var opts=Object.assign({},init||{});
  if(ctl&&!opts.signal){opts.signal=ctl.signal;tm=setTimeout(function(){ctl.abort()},15000)}
  return realFetch(base+path,opts).then(function(r){clearTimeout(tm);return r},function(e){clearTimeout(tm);throw e});
}
window.fetch=function(url,init){
  var u=typeof url==="string"?url:(url&&url.url)||"";
  var base=u.indexOf(A)===0?A:u.indexOf(B)===0?B:null;
  if(!base)return realFetch(url,init);
  var path=u.slice(base.length),one=firstBase(),two=one===A?B:A;
  return tryOnce(one,path,init).catch(function(){
    return tryOnce(two,path,init).then(function(r){try{localStorage.setItem("layaBase",two)}catch(e){}return r});
  }).catch(function(e){
    setTimeout(function(){
      var s=document.getElementById("loginStatus");
      if(s&&/Couldn.t connect/.test(s.textContent))
        s.textContent+=" Tried both addresses ("+(e&&e.name==="AbortError"?"timed out":"blocked, offline, or the worker refused this site")+").";
    },60);
    throw e;
  });
};
})();
