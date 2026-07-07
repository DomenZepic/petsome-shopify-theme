/* =====================================================================
   Petsome – Kviz "Načrt gibljivosti" (MobiMix funnel)
   Konfiguracija pride iz sekcije prek window.PetsomeQuiz.
   Lead se shrani prek nativnega Shopify /contact obrazca (isti origin).
   ===================================================================== */
(function () {
  var CFG = window.PetsomeQuiz || {};
  var CONFIG = {
    brand: CFG.brand || "Petsome",
    productUrl: CFG.productUrl || "/products/mobimix",
    productTitle: CFG.productTitle || "MobiMix",
    productImage: CFG.productImage || "",
    discountCode: CFG.discountCode || "SPREHOD5",
    discountPct: CFG.discountPct || 5,
    priceOld: CFG.priceOld || "",
    priceNew: CFG.priceNew || ""
  };

  var MONTHS = ["januar","februar","marec","april","maj","junij","julij","avgust","september","oktober","november","december"];
  function addDays(d){var t=new Date();t.setDate(t.getDate()+d);return t;}
  function fmtDate(dt){return dt.getDate()+". "+MONTHS[dt.getMonth()];}

  var S = { dog:"", owner:"", email:"", a:{} };

  var SCREENS = [
    {type:"intro"},
    {type:"name"},
    {type:"single", id:"size", eyebrow:"O vašem psu", title:"Kako velik je {dog}?",
     opts:[["Majhen (do 10 kg)","🐕",0],["Srednji (10–25 kg)","🐩",4],["Velik (25–40 kg)","🐕‍🦺",10],["Zelo velik (nad 40 kg)","🐺",14]]},
    {type:"single", id:"age", eyebrow:"O vašem psu", title:"Koliko je {dog} star?",
     opts:[["Mladiček (do 1 leta)","🍼",0],["Odrasel (1–6 let)","🎾",5],["Zrel (7–9 let)","🦴",14],["Senior (10+ let)","👑",22]]},
    {type:"single", id:"weight", eyebrow:"O vašem psu", title:"Kakšna je postava psa {dog}?",
     lead:"Vsak odvečen kilogram dodatno obremenjuje sklepe.",
     opts:[["Vitek","🏃",0],["Idealna teža","👍",0],["Nekaj odvečnih kg","⚖️",6],["Prekomerna teža","🍖",12]]},

    {type:"calc", title:"Analiziramo profil", msgs:[
      "Analiziramo profil pasme in starosti…","Primerjamo z bazo pasjih sklepov…","Pripravljamo naslednji korak…"]},

    {type:"cards", id:"problems", multi:true, eyebrow:"Trenutno stanje",
     title:"Katere znake opažate pri psu {dog}?", lead:"Izberite vse, kar velja.",
     opts:[["Težko vstajanje","🛏️",6],["Izogiba se stopnicam","🪜",6],["Ne skoči v avto/na kavč","🚗",6],
           ["Zaostaja na sprehodih","🐢",6],["Občasno šepa","🦵",8],["Okorelost (zjutraj/mraz)","🧊",6],
           ["Manj se igra","🎾",5],["Cvili ali je občutljiv","😣",8],["Nič od naštetega","✅",0,true]]},

    {type:"cards", id:"goals", multi:true, eyebrow:"Vaše sanje zanj",
     title:"Kaj bi si za psa {dog} najbolj želeli?", lead:"Izberite, kar vam največ pomeni.",
     opts:[["Da spet normalno hodi","🚶",0],["Da spet teče in se igra","🏃",0],["Da skoči v avto","🚗",0],
           ["Uživa v dolgih sprehodih","🌳",0],["Da nima bolečin","😌",0],["Ohrani gibljivost v prihodnje","⏳",0]]},

    {type:"calc", title:"Ugotavljamo vzrok", msgs:[
      "Ugotavljamo, kaj se dogaja s sklepi…","Povezujemo znake z mehanizmom…","Zbiramo dejstva o hrustancu…"]},

    {type:"edu", img:"🦴", eyebrow:"Zakaj se to dogaja",
     title:"Obraba hrustanca — tihi vzrok",
     ps:[
       "V zdravem sklepu blazina <b>hrustanca</b> in <b>sinovialna tekočina</b> skrbita, da kosti drsijo gladko, brez trenja in bolečin.",
       "Hrustanec gradijo <b>glikozaminoglikani (GAG)</b> — telo jih izdeluje iz <b>glukozamina in hondroitina</b>. Ti dodajajo tekočino v hrustanec in blažijo udarce.",
       "S starostjo (in <b>hitreje pri večjih pasmah</b>) naravna proizvodnja teh gradnikov upade. Hrustanec se stanjša, tekočina postane redkejša.",
       "Ključno: <b>hrustanec nima krvnih žil in se sam skoraj ne obnavlja.</b> Obraba se tiho kopiči — dolgo preden opazite šepanje."],
     stat:["80%","Do 80 % psov, starejših od 7 let, ima znake artroze. Prizadet je že vsak 5. pes, starejši od 1 leta."]},

    {type:"edu", img:"🔄", eyebrow:"Kaj to pomeni za {dog}",
     title:"Začaran krog, ki se vrti navzdol",
     ps:[
       "Bolečina → <b>pes se manj giblje</b> → mišice oslabijo → sklep ostane brez opore → <b>še večja bolečina.</b> In krog se vrti hitreje.",
       "Vsak teden brez podpore pomeni <b>več izgubljenega hrustanca, ki ga ni mogoče povrniti.</b>",
       "V vsakdanjem življenju to pomeni: krajši sprehodi, manj igre, več ležanja — in počasi ugasne iskrica v očeh.",
       "<b>Dobra novica:</b> če sklepom pravočasno vrnemo gradnike (glukozamin + hondroitin + MSM), lahko krog obrnemo. Mnogi psi v nekaj tednih spet zaživijo."],
     stat:null},

    {type:"diagnosis", lines:[
      "Ocenjujemo obrabo hrustanca glede na starost in velikost…",
      "Analiziramo izbrane znake gibanja in bolečine…",
      "Računamo oceno gibljivosti in udobja…",
      "Ocenjujemo »starost sklepov« psa {dog}…"]},

    {type:"results"},

    {type:"multi", id:"tried", eyebrow:"Vaša pot doslej",
     title:"Kaj ste za sklepe psa {dog} že poskusili?", lead:"Izberite vse, kar velja.",
     opts:[["Nič posebnega","—"],["Krajši, počasnejši sprehodi","🚶"],["Hrana za sklepe","🍲"],
           ["Dodatki iz trgovine","🛒"],["Zdravila proti bolečinam","💊"],["Obisk veterinarja","🏥"],["Hujšanje","⚖️"]]},

    {type:"single", id:"currently", eyebrow:"Vaša pot doslej",
     title:"Kaj trenutno redno počnete za njegove sklepe?",
     opts:[["Nič rednega","—",4],["Občasno kakšen dodatek","🔁",2],["Reden dodatek za sklepe","💊",0],["Posebna prehrana","🍲",1]]},

    {type:"single", id:"feels", eyebrow:"Kako to doživljate",
     title:"Kako se počutite, ko vidite psa {dog} okorelega ali v bolečinah?",
     opts:[["Trga mi srce","💔",0],["Skrbi me za njegovo prihodnost","😟",0],["Počutim se nemočno","😞",0],["Odločen/a sem, da mu pomagam","💪",0]]},

    {type:"single", id:"deadline", eyebrow:"Vaš cilj",
     title:"Do kdaj bi radi videli opazno izboljšanje?",
     opts:[["Čim prej – v nekaj tednih","⚡",0],["V 1–2 mesecih","📅",0],["Pred naslednjo sezono sprehodov","🌤️",0],["Samo želim, da mu je dolgoročno bolje","♾️",0]]},

    {type:"single", id:"important", eyebrow:"Vaše merilo",
     title:"Kaj vam je pri izboljšanju najbolj pomembno?",
     opts:[["Da je naravno in varno","🌿",0],["Da hitro deluje","⚡",0],["Da je enostavno za dajanje","🥄",0],["Da ima dokazane sestavine","🔬",0],["Da je cenovno dostopno","💶",0]]},

    {type:"calc", title:"Sestavljamo načrt", msgs:[
      "Sestavljamo osebni načrt za psa {dog}…","Usklajujemo z vašim ciljem in merili…","Izbiramo prave gradnike sklepov…","Načrt je skoraj pripravljen…"]},

    {type:"email"},
    {type:"plan"}
  ];

  var i = 0;
  var interactive = {name:1,single:1,multi:1,cards:1,email:1};
  var totalInteractive = SCREENS.filter(function(s){return interactive[s.type];}).length;
  function el(){return document.getElementById("psq-screen");}
  function fill(t){return (t||"").split("{dog}").join(S.dog || "vaš pes");}

  function setProgress(){
    var done = SCREENS.slice(0,i).filter(function(s){return interactive[s.type];}).length;
    var pct = SCREENS[i].type==="plan" ? 100 : Math.min(96, Math.round(done/totalInteractive*100));
    var f = document.getElementById("psq-pfill"); if(f) f.style.width = pct+"%";
  }
  function go(n){ i=n; render(); }
  function next(){ i++; render(); }

  var R = {intro:rIntro,name:rName,single:rSingle,multi:rSingle,cards:rCards,
    calc:rCalc,edu:rEdu,diagnosis:rDiagnosis,results:rResults,email:rEmail,plan:rPlan};
  function render(){
    var s = SCREENS[i]; setProgress();
    try{ window.scrollTo(0,0); }catch(e){}
    R[s.type](s);
  }
  function head(s){
    return (s.eyebrow?'<div class="q-eyebrow">'+fill(s.eyebrow)+'</div>':'')
      +'<h2>'+fill(s.title)+'</h2>'
      +(s.lead?'<p class="q-lead" style="margin-top:6px">'+fill(s.lead)+'</p>':'<div style="height:14px"></div>');
  }

  function rIntro(){
    el().className="q-fade";
    el().innerHTML='<div class="q-center" style="padding-top:12px">'
      +'<div style="font-size:62px;margin-bottom:6px">🐕</div>'
      +'<div class="q-eyebrow">Brezplačna ocena • 60 sekund</div>'
      +'<h1>Zakaj vaš pes okoreva — in kako mu vrniti brezskrbne sprehode</h1>'
      +'<p class="q-lead">Odgovorite na nekaj vprašanj in prejmite osebno oceno sklepov ter načrt gibljivosti, prilagojen prav vašemu psu.</p>'
      +'<button class="q-btn" data-act="next">Začni oceno →</button>'
      +'<div class="q-trust">🔒 Brez neželene pošte. Vaši podatki so varni.</div></div>';
  }

  function rName(){
    el().className="q-fade";
    el().innerHTML=head({eyebrow:"Za začetek",title:"Kako je ime vašemu psu?",lead:"Načrt bomo pripravili prav zanj."})
      +'<div class="q-field"><input type="text" id="psq-in" placeholder="npr. Rex" value="'+esc(S.dog)+'"></div>'
      +'<button class="q-btn" id="psq-c" '+(S.dog?"":"disabled")+' data-act="next">Naprej →</button>';
    var inp=document.getElementById("psq-in");
    inp.addEventListener("input",function(){S.dog=this.value.trim();document.getElementById("psq-c").disabled=!S.dog;});
    inp.addEventListener("keydown",function(e){if(e.key==="Enter"&&S.dog)next();});
    inp.focus();
  }

  function rSingle(s){
    var multi = s.type==="multi";
    var cur = S.a[s.id] || (multi?[]:null);
    el().className="q-fade";
    var opts = s.opts.map(function(o,k){
      var sel = multi?cur.indexOf(k)>-1:cur===k;
      return '<div class="q-opt '+(multi?"q-multi":"")+' '+(sel?"q-sel":"")+'" data-pick="'+s.id+'" data-k="'+k+'" data-multi="'+multi+'">'
        +'<span class="q-em">'+o[1]+'</span><span>'+o[0]+'</span>'
        +'<span class="q-mk">'+(sel?(multi?"✓":"●"):"")+'</span></div>';
    }).join("");
    el().innerHTML = head(s)+'<div class="q-opts">'+opts+'</div>'
      +(multi?'<button class="q-btn" id="psq-c" '+(cur.length?"":"disabled")+' data-act="next">Naprej →</button>':'');
    bindPicks();
  }

  function rCards(s){
    var cur = S.a[s.id]||[];
    el().className="q-fade";
    var cards = s.opts.map(function(o,k){
      var sel=cur.indexOf(k)>-1;
      return '<div class="q-cardo '+(sel?"q-sel":"")+'" data-pick="'+s.id+'" data-k="'+k+'" data-multi="true">'
        +'<div class="q-chk">✓</div><div class="q-tile">'+o[1]+'</div><div class="q-cl">'+o[0]+'</div></div>';
    }).join("");
    el().innerHTML = head(s)+'<div class="q-cards">'+cards+'</div>'
      +'<button class="q-btn" id="psq-c" '+(cur.length?"":"disabled")+' data-act="next">Naprej →</button>';
    bindPicks();
  }

  function bindPicks(){
    [].forEach.call(el().querySelectorAll("[data-pick]"),function(n){
      n.addEventListener("click",function(){pick(this.getAttribute("data-pick"),+this.getAttribute("data-k"),this.getAttribute("data-multi")==="true");});
    });
  }

  function pick(id,k,multi){
    var s = SCREENS.filter(function(x){return x.id===id;})[0];
    if(multi){
      var arr = S.a[id]||[];
      var opt = s.opts[k];
      var exIdx = -1; s.opts.forEach(function(o,ix){if(o[3]===true)exIdx=ix;});
      if(opt[3]===true){ arr = arr.indexOf(k)>-1?[]:[k]; }
      else { if(exIdx>=0) arr=arr.filter(function(x){return x!==exIdx;}); arr = arr.indexOf(k)>-1?arr.filter(function(x){return x!==k;}):arr.concat([k]); }
      S.a[id]=arr;
      (s.type==="cards"?rCards:rSingle)(s);
    } else {
      S.a[id]=k; setTimeout(next,170);
    }
  }

  function rCalc(s){
    el().className="q-fade";
    el().innerHTML='<div class="q-calc"><div class="q-spin"></div><div class="q-msg" id="psq-m">'+fill(s.msgs[0])+'</div></div>';
    var k=0, m=document.getElementById("psq-m");
    var iv=setInterval(function(){ k++;
      if(k>=s.msgs.length){clearInterval(iv);next();return;}
      m.style.opacity=0; setTimeout(function(){m.textContent=fill(s.msgs[k]);m.style.opacity=1;},200);
    }, 850);
  }

  function rEdu(s){
    el().className="q-fade";
    el().innerHTML='<div class="q-eduimg">'+s.img+'</div>'
      +'<div class="q-eyebrow">'+fill(s.eyebrow)+'</div>'
      +'<h2 style="margin-bottom:16px">'+fill(s.title)+'</h2>'
      +s.ps.map(function(p){return '<p class="q-edup">'+fill(p)+'</p>';}).join("")
      +(s.stat?'<div class="q-statbox"><div class="q-n">'+s.stat[0]+'</div><div class="q-t">'+s.stat[1]+'</div></div>':'')
      +'<button class="q-btn" data-act="next" style="margin-top:8px">Nadaljuj →</button>';
  }

  function rDiagnosis(s){
    el().className="q-fade";
    el().innerHTML='<div style="padding-top:20px"><div class="q-eyebrow q-center">Diagnostika sklepov</div>'
      +'<h2 class="q-center" style="margin-bottom:6px">Pripravljamo oceno za psa '+fill("{dog}")+'</h2>'
      +'<div class="q-dlines" id="psq-dl">'+s.lines.map(function(l){return '<div class="q-dline"><div class="q-ic"></div><div>'+fill(l)+'</div></div>';}).join("")+'</div></div>';
    var rows=[].slice.call(el().querySelectorAll(".q-dline")), k=0;
    (function step(){
      if(k>0) rows[k-1].className="q-dline q-on q-done";
      if(k>=rows.length){ setTimeout(next,500); return; }
      rows[k].className="q-dline q-on"; k++; setTimeout(step,780);
    })();
  }

  /* ---------- Ocenjevanje ---------- */
  function byId(id){return SCREENS.filter(function(x){return x.id===id;})[0];}
  function score(){
    var a=S.a, risk=0;
    function val(id){var o=byId(id),k=a[id];return (o&&k!=null&&o.opts[k])?(o.opts[k][2]||0):0;}
    risk += val("size")+val("age")+val("weight")+val("currently");
    var probs=(a.problems||[]).map(function(k){return byId("problems").opts[k];}).filter(function(o){return o[3]!==true;});
    probs.forEach(function(o){risk+=o[2]||0;});
    var health = Math.max(14, Math.min(92, Math.round(100-risk)));
    function clamp(n){return Math.max(22,Math.min(90,Math.round(n)));}
    var painish = probs.filter(function(o){return /cvili|Občutljiv|šepa|Okorelost/i.test(o[0]);}).length;
    var mob = clamp(94 - val("size") - val("age")*1.1 - probs.length*6);
    var comf= clamp(96 - probs.length*8 - (painish?10:0));
    var supp= clamp(88 - val("currently")*8 - val("weight")*2);
    var act = clamp(92 - val("age")*1.4 - probs.length*5);
    var base=[1,4,8,11][a.age==null?1:a.age];
    var added=Math.max(1,Math.min(6,Math.round((100-health)/12)));
    var band;
    if(health<42) band={k:"NIZKA",c:"var(--alert)",t:"Povečana obraba sklepov opazno vpliva na gibljivost in udobje."};
    else if(health<66) band={k:"ZMERNA",c:"var(--accent-d)",t:"Zaznanih je več dejavnikov, ki načenjajo sklepe."};
    else band={k:"DOBRA",c:"var(--good)",t:"Sklepi so še v dobri formi – zdaj je čas za preventivo."};
    return {health:health,band:band,mob:mob,comf:comf,supp:supp,act:act,base:base,jointAge:base+added,added:added,nProb:probs.length};
  }
  function subColor(v){return v<45?"var(--alert)":v<68?"var(--accent)":"var(--good)";}

  function rResults(){
    var r=score(); el().className="q-fade";
    var C=2*Math.PI*80, off=C*(1-r.health/100);
    function sc(t,v,d){return '<div class="q-sub"><div class="q-st"><span>'+t+'</span><span class="q-sv" style="color:'+subColor(v)+'">'+v+'</span></div>'
      +'<div class="q-bar"><i style="width:'+v+'%;background:'+subColor(v)+'"></i></div><div class="q-sd">'+d+'</div></div>';}
    el().innerHTML=
      '<div class="q-eyebrow q-center">Vaša osebna ocena</div>'
      +'<h2 class="q-center" style="margin-bottom:14px">Ocena sklepov za psa '+fill("{dog}")+'</h2>'
      +'<div class="q-ringwrap"><div class="q-ring">'
        +'<svg width="180" height="180"><circle cx="90" cy="90" r="80" stroke="var(--line)" stroke-width="14" fill="none"/>'
        +'<circle cx="90" cy="90" r="80" stroke="'+r.band.c+'" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+C+'" id="psq-ring"/></svg>'
        +'<div class="q-val"><div class="q-num">'+r.health+'</div><div class="q-den">/ 100</div></div></div>'
        +'<div><span class="q-band" style="background:'+r.band.c+'22;color:'+r.band.c+'">'+r.band.k+'</span></div>'
        +'<p class="q-lead q-center" style="margin-top:2px">'+r.band.t+'</p></div>'
      +'<div class="q-subgrid">'
        +sc("Gibljivost",r.mob,"Kako prosto se giblje in vstaja.")
        +sc("Udobje",r.comf,"Ocena bolečine in okorelosti.")
        +sc("Podpora hrustancu",r.supp,"Koliko gradnikov sklep dobiva.")
        +sc("Aktivnost",r.act,"Igra, sprehodi, vzdržljivost.")
      +'</div>'
      +'<div class="q-agecard"><div class="q-lab">STAROST SKLEPOV</div>'
        +'<div class="q-row"><div><div class="q-sm">KRONOLOŠKA</div><div class="q-big">~'+r.base+' let</div></div>'
        +'<div class="q-arrow">→</div>'
        +'<div><div class="q-sm">SKLEPI DELUJEJO KOT</div><div class="q-big q-warm">~'+r.jointAge+' let</div></div></div>'
        +'<div style="font-size:12px;opacity:.75;margin-top:10px">+'+r.added+' let hitrejše staranje sklepov</div></div>'
      +'<div class="q-callout">⚠️ <div>Ocena <b>'+r.health+' ('+r.band.k+')</b> in '+(r.nProb||"opaženi")+' znak(ov) kažejo, da hrustanec psa '+fill("{dog}")+' nima dovolj gradnikov. Brez ukrepanja se obraba tiho nadaljuje.</div></div>'
      +'<div class="q-goodbox"><h4>Dobra novica 🌿</h4>'
        +'<p>Obrabo je mogoče upočasniti, gibljivost pa pogosto povrniti. Ko psi dobijo prave gradnike sklepov, se pogosto zgodi tole:</p>'
        +'<div class="q-tl">'
        +'<div class="q-tlrow"><span class="q-tag">7–14 dni</span><span>Manj okorelosti zjutraj, lažje vstajanje</span></div>'
        +'<div class="q-tlrow"><span class="q-tag">3–4 tedne</span><span>Daljši sprehodi, več volje do igre</span></div>'
        +'<div class="q-tlrow"><span class="q-tag">60+ dni</span><span>Bolj gibčen, samozavesten – spet skoči in teče</span></div>'
        +'</div></div>'
      +'<button class="q-btn q-accent" data-act="next">Pokaži rešitev za psa '+fill("{dog}")+' →</button>'
      +'<button class="q-btn q-ghost" data-act="restart">↺ Ponovi oceno</button>'
      +'<p class="q-disc">Ta ocena je informativne narave in ne predstavlja veterinarske diagnoze. Ob resnih težavah se posvetujte z veterinarjem.</p>';
    setTimeout(function(){var c=document.getElementById("psq-ring");if(c){c.style.transition="stroke-dashoffset 1s cubic-bezier(.2,.7,.3,1)";c.style.strokeDashoffset=off;}},120);
  }

  function rEmail(){
    el().className="q-fade";
    el().innerHTML='<div class="q-center"><div style="font-size:52px;margin-bottom:4px">📋</div></div>'
      +head({eyebrow:"Zadnji korak",title:"Načrt za psa {dog} je pripravljen!",lead:"Kam naj pošljemo osebni načrt gibljivosti? Odklenili boste tudi darilni popust."})
      +'<div class="q-field"><label class="q-fl">Vaše ime</label><input type="text" id="psq-own" placeholder="Vaše ime" value="'+esc(S.owner)+'"></div>'
      +'<div class="q-field"><label class="q-fl">E-naslov</label><input type="email" id="psq-em" placeholder="ime@primer.si" value="'+esc(S.email)+'"></div>'
      +'<label class="q-consent"><input type="checkbox" id="psq-cons"><span>Strinjam se, da mi '+CONFIG.brand+' pošlje načrt in občasne nasvete ter ponudbe. Odjava je mogoča kadar koli.</span></label>'
      +'<button class="q-btn" id="psq-c" disabled data-act="submit">Odkleni moj načrt →</button>'
      +'<div class="q-trust">🔒 Nikoli ne delimo vaših podatkov.</div>';
    var own=document.getElementById("psq-own"), em=document.getElementById("psq-em"), cons=document.getElementById("psq-cons");
    own.addEventListener("input",function(){S.owner=this.value.trim();});
    em.addEventListener("input",chkEmail); cons.addEventListener("change",chkEmail);
    em.addEventListener("keydown",function(e){if(e.key==="Enter")submitEmail();});
  }
  function chkEmail(){
    var em=document.getElementById("psq-em"), cons=document.getElementById("psq-cons");
    S.email=(em?em.value:"").trim();
    var ok=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.email)&&cons&&cons.checked;
    var b=document.getElementById("psq-c"); if(b) b.disabled=!ok;
  }
  function submitEmail(){
    var cons=document.getElementById("psq-cons");
    var ok=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(S.email)&&cons&&cons.checked;
    if(!ok)return; saveLead(); next();
  }

  function rPlan(){
    var r=score(); el().className="q-fade"; var a=S.a;
    function pick1(id){var o=byId(id),k=a[id];return o&&k!=null?o.opts[k][0]:"—";}
    var goalTxt=(a.goals&&a.goals.length)?byId("goals").opts[a.goals[0]][0]:"spet brezskrbno gibanje";
    var mainSign=(a.problems&&a.problems.length)?byId("problems").opts[a.problems[0]][0]:"okorelost";
    var d1=fmtDate(addDays(28)), d2=fmtDate(addDays(63));
    var rev=[
      ["★★★★★","Po treh tednih Bela spet sama skoči na kavč. Nisem mogla verjeti.","Maja K. — zlati prinašalec, 8 let"],
      ["★★★★★","Najin 9-letni labrador spet vleče na sprehod kot mladič. Hvala!","Tomaž R. — labrador"],
      ["★★★★★","Zjutraj ni več okorel. Enostavno posujem po hrani in ga poje.","Nina P. — mešanček"]];
    var price = (CONFIG.priceOld&&CONFIG.priceNew)
      ? '<div class="q-price"><s>'+CONFIG.priceOld+'</s><b>'+CONFIG.priceNew+'</b><span class="q-save">−'+CONFIG.discountPct+' %</span></div>' : "";
    var pillInner = CONFIG.productImage ? '<img src="'+CONFIG.productImage+'" alt="'+esc(CONFIG.productTitle)+'">' : "🦴";
    el().innerHTML=
      '<div class="q-center"><span class="q-planbadge">✓ VAŠ NAČRT JE PRIPRAVLJEN</span></div>'
      +'<h1 class="q-center">Načrt gibljivosti za psa '+fill("{dog}")+'</h1>'
      +'<p class="q-lead q-center">Sestavljen okoli ocene sklepov, profila in vašega cilja: <b>'+goalTxt.toLowerCase()+'</b>.</p>'
      +'<div class="q-chips">'
        +'<div class="q-chip"><div class="q-ck">Velikost</div><div class="q-cv">'+pick1("size")+'</div></div>'
        +'<div class="q-chip"><div class="q-ck">Starost</div><div class="q-cv">'+pick1("age")+'</div></div>'
        +'<div class="q-chip"><div class="q-ck">Ocena</div><div class="q-cv">'+r.health+'/100</div></div>'
        +'<div class="q-chip"><div class="q-ck">Glavni znak</div><div class="q-cv">'+mainSign+'</div></div>'
        +'<div class="q-chip"><div class="q-ck">Cilj do</div><div class="q-cv">'+pick1("deadline")+'</div></div>'
      +'</div>'
      +'<div class="q-scratchwrap"><h3>🎁 Vaš darilni popust</h3><div class="q-ss">Popraskajte polje in odkrijte svojo kodo</div>'
        +'<div class="q-scratch" id="psq-scratch"><div class="q-reveal"><div><div class="q-code">'+CONFIG.discountCode+'</div><div class="q-rp">−'+CONFIG.discountPct+'% NA PRVO NAROČILO</div></div></div>'
        +'<canvas id="psq-scv"></canvas></div>'
        +'<div class="q-scratchhint">Povlecite s prstom ali miško čez sivo polje</div></div>'
      +'<div class="q-section"><h3>📈 Vaša časovnica preobrazbe</h3><div class="q-ptl">'
        +'<div class="q-r"><div class="q-dot">1</div><div><div class="q-rt">Ta teden</div><div class="q-rd">Manj jutranje okorelosti, lažje vstajanje</div></div></div>'
        +'<div class="q-r"><div class="q-dot">2</div><div><div class="q-rt">Do '+d1+'</div><div class="q-rd">Daljši sprehodi, več volje do igre, globlji spanec</div></div></div>'
        +'<div class="q-r q-star"><div class="q-dot">★</div><div><div class="q-rt">Do '+d2+'</div><div class="q-rd">Opazno bolj gibčen – '+goalTxt.toLowerCase()+'</div></div></div>'
      +'</div></div>'
      +'<div class="q-section"><h3>💪 Na čem temelji vaš načrt</h3><ul class="q-flist">'
        +'<li><span class="q-ic">✓</span><span><b>Glukozamin</b> – gradnik hrustanca in sinovialne tekočine</span></li>'
        +'<li><span class="q-ic">✓</span><span><b>Hondroitin</b> – zadržuje tekočino v hrustancu in zavira encime, ki ga razgrajujejo</span></li>'
        +'<li><span class="q-ic">✓</span><span><b>MSM</b> – naravno žveplo za manj otrdelosti in nelagodja</span></li>'
        +'<li><span class="q-ic">✓</span><span>Ena okusna dnevna doza – posujete po hrani, brez pretvarjanja</span></li>'
      +'</ul></div>'
      +'<div class="q-offer"><div class="q-prod"><div class="q-pill">'+pillInner+'</div>'
        +'<div style="text-align:left"><h3>'+CONFIG.productTitle+'</h3><div class="q-psub">Dnevna podpora za gibljive sklepe</div></div></div>'
        +'<p style="font-size:14px;opacity:.9">Formula z glukozaminom, hondroitinom in MSM – zasnovana prav za pse, kot je '+fill("{dog}")+'.</p>'
        +price
        +'<div style="margin:10px 0 4px" class="q-stars">★★★★★ <span style="color:#fff;opacity:.8;font-size:12px">4,8 / 5 (1.200+ ocen)</span></div>'
        +'<a class="q-btn q-accent" href="'+CONFIG.productUrl+'" style="margin-top:12px;text-decoration:none">Naročite '+CONFIG.productTitle+' z −'+CONFIG.discountPct+'% →</a>'
        +'<div style="font-size:11px;opacity:.7;margin-top:10px">Koda '+CONFIG.discountCode+' se doda samodejno</div></div>'
      +'<div class="q-reviews">'+rev.map(function(v){return '<div class="q-rev"><div class="q-stars">'+v[0]+'</div><div class="q-rt">„'+v[1]+'”</div><div class="q-ra">'+v[2]+'</div></div>';}).join("")+'</div>'
      +'<div class="q-badges"><div class="q-tb">🛡️ 90-dnevno jamstvo</div><div class="q-tb">🐾 15.000+ zadovoljnih psov</div><div class="q-tb">🌿 100 % naravno</div></div>'
      +'<p class="q-disc">Ta načrt je informativne narave in ne nadomešča veterinarskega mnenja. Prehranski dodatki ne zdravijo bolezni; ob resnih težavah se posvetujte z veterinarjem.</p>';
    initScratch();
  }

  /* ---------- Scratch card ---------- */
  function initScratch(){
    var cv=document.getElementById("psq-scv"); if(!cv)return;
    var box=cv.parentElement, rect=box.getBoundingClientRect();
    var w=rect.width||230, h=rect.height||96, dpr=window.devicePixelRatio||1;
    cv.width=w*dpr; cv.height=h*dpr; cv.style.width=w+"px"; cv.style.height=h+"px";
    var ctx=cv.getContext("2d"); ctx.scale(dpr,dpr);
    var g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,"#c9bfae"); g.addColorStop(1,"#b7ad9a");
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle="rgba(255,255,255,.6)"; ctx.font="600 13px -apple-system,sans-serif"; ctx.textAlign="center";
    ctx.fillText("✦ POPRASKAJ ✦", w/2, h/2+4);
    ctx.globalCompositeOperation="destination-out";
    var drawing=false, revealed=false;
    function pos(e){var r=cv.getBoundingClientRect();var t=e.touches?e.touches[0]:e;return[t.clientX-r.left,t.clientY-r.top];}
    function scratch(x,y){ctx.beginPath();ctx.arc(x,y,18,0,7);ctx.fill();}
    function pct(){var d=ctx.getImageData(0,0,cv.width,cv.height).data,c=0;for(var k=3;k<d.length;k+=64)if(d[k]===0)c++;return c/(d.length/64);}
    function check(){if(!revealed&&pct()>.5){revealed=true;cv.style.transition="opacity .4s";cv.style.opacity=0;}}
    function start(e){drawing=true;var p=pos(e);scratch(p[0],p[1]);e.preventDefault();}
    function move(e){if(!drawing)return;var p=pos(e);scratch(p[0],p[1]);check();e.preventDefault();}
    function end(){drawing=false;check();}
    cv.addEventListener("mousedown",start);cv.addEventListener("mousemove",move);window.addEventListener("mouseup",end);
    cv.addEventListener("touchstart",start,{passive:false});cv.addEventListener("touchmove",move,{passive:false});cv.addEventListener("touchend",end);
  }

  /* ---------- Shopify capture (isti origin) ---------- */
  function buildTags(){
    var r=score();
    var size=["majhen","srednji","velik","zelo-velik"][S.a.size];
    var age=["mladicek","odrasel","zrel","senior"][S.a.age];
    var band={NIZKA:"nizka",ZMERNA:"zmerna",DOBRA:"dobra"}[r.band.k];
    return ["petsome-kviz","kviz-sklepi","MobiMix-lead","ocena-"+band,
      size?"velikost-"+size:null, age?"starost-"+age:null].filter(Boolean).join(",");
  }
  function saveLead(){
    try{ console.log("PETSOME LEAD →",{dog:S.dog,owner:S.owner,email:S.email,score:score().health,tags:buildTags()}); }catch(e){}
    var f=new URLSearchParams();
    f.append("form_type","customer"); f.append("utf8","✓");
    f.append("contact[email]",S.email);
    f.append("contact[first_name]",S.owner||S.dog);
    f.append("contact[last_name]","(pes: "+S.dog+")");
    f.append("contact[tags]",buildTags());
    try{
      fetch("/contact",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:f.toString()}).catch(function(){});
    }catch(e){}
  }

  function esc(s){return (s||"").replace(/"/g,"&quot;").replace(/</g,"&lt;");}
  function restart(){i=0;S.dog="";S.owner="";S.email="";S.a={};render();}

  /* delegirani klik za data-act gumbe */
  document.addEventListener("click",function(e){
    var t=e.target.closest?e.target.closest("[data-act]"):null;
    if(!t||!el()||!el().contains(t))return;
    var act=t.getAttribute("data-act");
    if(act==="next")next(); else if(act==="submit")submitEmail(); else if(act==="restart")restart();
  });

  render();
})();
