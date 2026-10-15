/* More mini games: snake, 2048, connect four.
   Plugs into the existing Games section (#games) and its tab row (.gm-tabs). */
(function(){
var $=function(i){return document.getElementById(i)};
var G=$("games"),tabsBox=G&&G.querySelector(".gm-tabs");
if(!tabsBox)return;

var st=document.createElement("style");
st.textContent=
".gx-cv{display:block;max-width:100%;height:auto;border:1px solid #c9a7d6;border-radius:3px;background:#0c0711;touch-action:none;box-shadow:0 0 12px rgba(139,41,71,.4)}"+
".gx-g{display:grid;gap:6px;justify-content:start;touch-action:none}"+
".gx-t{display:grid;place-items:center;width:min(70px,19vw);height:min(70px,19vw);border-radius:3px;font:700 1.15rem 'Courier New',monospace;color:#fff;background:#150b1d;border:1px solid #3b1d4d}"+
".gx-pad{display:grid;grid-template-columns:repeat(3,48px);gap:6px;margin-top:10px}"+
".gx-pad button{height:44px}"+
".gx-c4{display:grid;grid-template-columns:repeat(7,min(40px,11vw));gap:6px;justify-content:start}"+
".gx-c{height:min(40px,11vw);border-radius:50%;border:1px solid #3b1d4d;background:#0c0711;cursor:pointer;padding:0;font-size:1.1rem;color:#fff}"+
".gx-c.p1{background:#ff5f8f;border-color:#fff}.gx-c.p2{background:#8e6aa6;border-color:#fff}.gx-c.w{box-shadow:0 0 12px #fff}";
document.head.appendChild(st);

var panels={mm:$("gmMM"),ttt:$("gmTT")},stops={};
function el(t,c,x){var n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n}
function row(){return el("div","gm-row")}
function sbtn(txt,fn){var b=el("button","smallbtn",txt);b.type="button";b.onclick=fn;return b}
function best(k){try{return +localStorage.getItem("gx_"+k)||0}catch(e){return 0}}
function setBest(k,v){try{localStorage.setItem("gx_"+k,v)}catch(e){}}
function active(k){return panels[k]&&!panels[k].hidden&&!G.classList.contains("view-off")}
function show(k){
  for(var n in panels)panels[n].hidden=n!==k;
  tabsBox.querySelectorAll("[data-g]").forEach(function(t){t.classList.toggle("on",t.dataset.g===k)});
  for(var s in stops)if(s!==k)try{stops[s]()}catch(e){}
}
tabsBox.querySelectorAll("[data-g]").forEach(function(t){t.addEventListener("click",function(){show(t.dataset.g)})});
function mk(k,label,build){
  var t=el("button","smallbtn",label);t.type="button";t.dataset.g=k;t.addEventListener("click",function(){show(k)});tabsBox.appendChild(t);
  var p=el("div");p.hidden=true;panels[k]=p;
  (panels.ttt.parentNode).appendChild(p);
  build(p);
}
function swipe(node,fn){
  var sx=0,sy=0;
  node.addEventListener("touchstart",function(e){var t=e.touches[0];sx=t.clientX;sy=t.clientY},{passive:true});
  node.addEventListener("touchend",function(e){var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
    if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;
    if(Math.abs(dx)>Math.abs(dy))fn(dx>0?"R":"L");else fn(dy>0?"D":"U")},{passive:true});
}
document.addEventListener("keydown",function(e){
  var m={ArrowUp:"U",ArrowDown:"D",ArrowLeft:"L",ArrowRight:"R",w:"U",s:"D",a:"L",d:"R"}[e.key];
  if(!m)return;
  var t=e.target&&e.target.tagName;if(t=="INPUT"||t=="TEXTAREA")return;
  ["snake","g2048"].forEach(function(k){if(active(k)){if(e.key.indexOf("Arrow")==0)e.preventDefault();if(keyFns[k])keyFns[k](m)}});
});
var keyFns={};

/* ---------- SNAKE ---------- */
mk("snake","snake",function(p){
  var N=15,S=20,c=el("canvas","gx-cv");c.width=c.height=N*S;
  var ctx=c.getContext("2d"),inf=el("span"),go=sbtn("start",start);
  var r=row();r.appendChild(go);r.appendChild(inf);
  p.appendChild(c);p.appendChild(r);
  var pad=el("div","gx-pad"),map=[["","U",""],["L","","R"],["","D",""]];
  var sym={U:"\u25B2",D:"\u25BC",L:"\u25C0",R:"\u25B6"};
  map.forEach(function(rw){rw.forEach(function(d){if(!d){pad.appendChild(el("span"));return}var b=sbtn(sym[d],function(){turn(d)});pad.appendChild(b)})});
  p.appendChild(pad);
  var sn,dir,nd,food,sc,iv=0,over=false;
  function place(){do{food={x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)}}while(sn.some(function(s){return s.x==food.x&&s.y==food.y}))}
  function reset(){sn=[{x:7,y:7},{x:6,y:7},{x:5,y:7}];dir={x:1,y:0};nd=dir;sc=0;over=false;place();draw();show_()}
  function show_(){inf.textContent="score: "+sc+"  |  best: "+best("snake")}
  function draw(){
    ctx.fillStyle="#0c0711";ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle="#ffb3d1";ctx.font="16px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("\u2726",food.x*S+S/2,food.y*S+S/2);
    sn.forEach(function(s,i){ctx.fillStyle=i?"#8e6aa6":"#ff9ab8";ctx.fillRect(s.x*S+1,s.y*S+1,S-2,S-2)});
  }
  function turn(d){
    var v={U:{x:0,y:-1},D:{x:0,y:1},L:{x:-1,y:0},R:{x:1,y:0}}[d];
    if(v.x==-dir.x&&v.y==-dir.y)return;nd=v;
  }
  function step(){
    dir=nd;var h={x:(sn[0].x+dir.x+N)%N,y:(sn[0].y+dir.y+N)%N};
    if(sn.some(function(s){return s.x==h.x&&s.y==h.y})){stop();over=true;if(sc>best("snake"))setBest("snake",sc);inf.textContent="game over \u2020 score "+sc;return}
    sn.unshift(h);
    if(h.x==food.x&&h.y==food.y){sc++;place()}else sn.pop();
    draw();show_();
  }
  function stop(){clearInterval(iv);iv=0;go.textContent="start"}
  function start(){if(iv){stop();return}if(over||!sn)reset();iv=setInterval(step,130);go.textContent="pause"}
  stops.snake=stop;
  keyFns.snake=function(d){turn(d);if(!iv&&!over)start()};
  swipe(c,function(d){turn(d);if(!iv&&!over)start()});
  reset();
});

/* ---------- 2048 ---------- */
mk("g2048","2048",function(p){
  var b=el("div","gx-g");b.style.gridTemplateColumns="repeat(4,min(70px,19vw))";
  var inf=el("span"),r=row();r.appendChild(sbtn("new game",reset));r.appendChild(inf);
  p.appendChild(b);p.appendChild(r);
  var cells=[],a,sc,done;
  var COL={0:"#150b1d",2:"#3b1d4d",4:"#5a2a6e",8:"#8b2947",16:"#a82a78",32:"#c2456b",64:"#e0489a",128:"#8e6aa6",256:"#7a5ad0",512:"#4d7cff",1024:"#2fa8c8",2048:"#ffd27a"};
  for(var i=0;i<16;i++){var t=el("div","gx-t");cells.push(t);b.appendChild(t)}
  function add(){var e=[];a.forEach(function(v,i){if(!v)e.push(i)});if(!e.length)return;a[e[Math.floor(Math.random()*e.length)]]=Math.random()<.9?2:4}
  function draw(){a.forEach(function(v,i){cells[i].textContent=v||"";cells[i].style.background=COL[v]||"#ffd27a";cells[i].style.color=v==2048?"#2a0f3a":"#fff"});
    var bs=best("g2048");if(sc>bs){setBest("g2048",sc);bs=sc}
    inf.textContent=(done?"no moves left \u2020  ":"")+"score: "+sc+"  |  best: "+bs}
  function reset(){a=Array(16).fill(0);sc=0;done=false;add();add();draw()}
  function lines(d){
    var L=[];for(var i=0;i<4;i++){var l=[];for(var j=0;j<4;j++){
      l.push(d=="L"?i*4+j:d=="R"?i*4+3-j:d=="U"?j*4+i:(3-j)*4+i)}L.push(l)}return L}
  function slide(v){var f=v.filter(Boolean),o=[],gain=0;
    for(var i=0;i<f.length;i++){if(f[i]==f[i+1]){o.push(f[i]*2);gain+=f[i]*2;i++}else o.push(f[i])}
    while(o.length<4)o.push(0);return{o:o,gain:gain}}
  function can(){if(a.indexOf(0)>-1)return true;for(var i=0;i<16;i++){var x=i%4,y=(i/4)|0;if(x<3&&a[i]==a[i+1])return true;if(y<3&&a[i]==a[i+4])return true}return false}
  function move(d){
    if(done)return;var moved=false;
    lines(d).forEach(function(l){var v=l.map(function(i){return a[i]}),s=slide(v);
      s.o.forEach(function(n,k){if(a[l[k]]!==n){moved=true;a[l[k]]=n}});sc+=s.gain});
    if(moved){add();if(!can())done=true;draw()}
  }
  keyFns.g2048=move;swipe(b,move);
  stops.g2048=function(){};
  reset();
});

/* ---------- CONNECT FOUR ---------- */
mk("c4","connect four",function(p){
  var R=6,Cc=7,board,over,turn;
  var grid=el("div","gx-c4"),inf=el("span"),r=row();r.appendChild(sbtn("again",reset));r.appendChild(inf);
  p.appendChild(grid);p.appendChild(r);
  var cells=[];
  for(var i=0;i<R*Cc;i++)(function(i){var c=el("button","gx-c");c.type="button";c.setAttribute("aria-label","column "+(i%Cc+1));c.onclick=function(){play(i%Cc)};cells.push(c);grid.appendChild(c)})(i);
  function drop(b,col,pl){for(var r=R-1;r>=0;r--)if(!b[r*Cc+col]){b[r*Cc+col]=pl;return r}return -1}
  function wins(b,r,c,pl){
    return [[0,1],[1,0],[1,1],[1,-1]].some(function(d){var n=1;
      [1,-1].forEach(function(s){var y=r+d[0]*s,x=c+d[1]*s;while(y>=0&&y<R&&x>=0&&x<Cc&&b[y*Cc+x]==pl){n++;y+=d[0]*s;x+=d[1]*s}});return n>=4})}
  function draw(){board.forEach(function(v,i){cells[i].className="gx-c"+(v==1?" p1":v==2?" p2":"");cells[i].textContent=v==1?"\u2665":v==2?"\u263E":""})}
  function bot(){
    var ok=[];for(var c=0;c<Cc;c++)if(!board[c])ok.push(c);
    function test(pl,c){var b=board.slice(),r=drop(b,c,pl);return r>=0&&wins(b,r,c,pl)}
    var i;for(i=0;i<ok.length;i++)if(test(2,ok[i]))return ok[i];
    for(i=0;i<ok.length;i++)if(test(1,ok[i]))return ok[i];
    var safe=ok.filter(function(c){var b=board.slice(),r=drop(b,c,2);if(r<=0)return true;return !(function(){var b2=b.slice(),r2=drop(b2,c,1);return r2>=0&&wins(b2,r2,c,1)})()});
    var pool=safe.length?safe:ok;
    pool.sort(function(a,b){return Math.abs(a-3)-Math.abs(b-3)+(Math.random()-.5)*2});
    return pool[0];
  }
  function finish(msg){over=true;inf.textContent=msg}
  function play(c){
    if(over||turn!==1)return;var r=drop(board,c,1);if(r<0)return;draw();
    if(wins(board,r,c,1)){finish("you win \u2726");return}
    if(board.every(Boolean)){finish("a draw, how fitting");return}
    turn=2;inf.textContent="the moon is thinking...";
    setTimeout(function(){if(over)return;var bc=bot(),br=drop(board,bc,2);draw();
      if(wins(board,br,bc,2)){finish("the moon wins \u2020");return}
      if(board.every(Boolean)){finish("a draw, how fitting");return}
      turn=1;inf.textContent="your turn (\u2665)"},450);
  }
  function reset(){board=Array(R*Cc).fill(0);over=false;turn=1;inf.textContent="you are \u2665, drop into a column";draw()}
  stops.c4=function(){};
  reset();
});
})();
