let count=0;document.querySelector('#page-action').onclick=()=>document.querySelector('#action-count').textContent=String(++count);
document.querySelector('#add-card').onclick=()=>{const h=document.createElement('h2');h.className='card-title dynamic';h.textContent='Dynamically inserted heading';document.querySelector('#cards').append(h);};
document.querySelector('#spa').onclick=()=>{history.pushState({},'',location.pathname+'?route=next');document.querySelector('#intro').textContent='The route changed without a reload.';};
function shadow(host,mode){const root=host.attachShadow({mode});root.innerHTML='<style>h2{font:700 26px Georgia}</style><h2 class="shadow-title">Inside a '+mode+' shadow root</h2><p>Typography in a nested component.</p>';}
shadow(document.querySelector('#open-shadow'),'open');shadow(document.querySelector('#closed-shadow'),'closed');
document.querySelector('#shadow').onclick=()=>{const el=document.createElement('div');document.querySelector('#cards').append(el);shadow(el,'open');};
