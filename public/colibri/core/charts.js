// Dependency-free, token-styled SVG charts. Public renderers accept finite numbers only.
import { cleanupController } from "./util.js";
const escapeLabel = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const dimension = (value, name) => { if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`Invalid chart ${name}`); return value; };
const numbers = data => { if (!Array.isArray(data) || data.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new TypeError('Chart data must contain finite numbers'); return data; };
const svg = (w, h, inner, label) => `<svg viewBox="0 0 ${dimension(w,'width')} ${dimension(h,'height')}" role="img" aria-label="${escapeLabel(label)}" preserveAspectRatio="none" class="chart">${inner}</svg>`;
const extent = values => values.reduce(([min,max],v)=>[Math.min(min,v),Math.max(max,v)],[0,0]);
export function sparkline(data, {w=120,h=36,label='trend'}={}) {
 numbers(data);dimension(w,'width');dimension(h,'height');
 const [min,max]=extent(data), range=max-min||1;
 const d=data.map((v,i)=>(i?'L':'M')+`${(i*w/Math.max(1,data.length-1)).toFixed(1)} ${(h-(v-min)/range*h).toFixed(1)}`).join('');
 return svg(w,h,data.length?`<path d="${d}" fill="none" stroke="var(--chart-1, var(--c-accent))" stroke-width="2" vector-effect="non-scaling-stroke"/>`:'',label);
}
export function area(series,{w=600,h=200,label='area chart'}={}) {
 if(!Array.isArray(series))throw new TypeError('Chart series must be an array');series.forEach(numbers);dimension(w,'width');dimension(h,'height');
 const [min,max]=extent(series.flat()),range=max-min||1, y=v=>h-(v-min)/range*h, baseline=y(0);
 let out='';for(let i=1;i<4;i++)out+=`<line x1="0" x2="${w}" y1="${h*i/4}" y2="${h*i/4}" stroke="var(--c-line)" stroke-dasharray="3 4"/>`;
 series.forEach((data,index)=>{if(!data.length)return;const d=data.map((v,i)=>(i?'L':'M')+`${(i*w/Math.max(1,data.length-1)).toFixed(1)} ${y(v).toFixed(1)}`).join('');const color=`var(--chart-${index+1}, var(--c-accent))`;
 out+=`<path d="${d} L${w} ${baseline} L0 ${baseline}Z" fill="${color}" opacity=".14"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.25" vector-effect="non-scaling-stroke"/>`;});
 return svg(w,h,out,label);
}
export function bars(data,{w=600,h=200,gap=.3,label='bar chart'}={}) {
 numbers(data);dimension(w,'width');dimension(h,'height');if(!Number.isFinite(gap)||gap<0||gap>=1)throw new TypeError('Invalid bar gap');
 const [min,max]=extent(data),range=max-min||1,bw=w/Math.max(1,data.length),y=v=>h-(v-min)/range*h;
 return svg(w,h,data.map((v,i)=>`<rect x="${i*bw+bw*gap/2}" y="${Math.min(y(v),y(0))}" width="${bw*(1-gap)}" height="${Math.abs(y(v)-y(0))}" rx="3" fill="var(--chart-${i%2+1}, var(--c-accent))"><title>${v}</title></rect>`).join(''),label);
}
export function donut(parts,{size=140,thick=18,label='donut chart'}={}) {
 numbers(parts);dimension(size,'size');dimension(thick,'thickness');if(thick>=size||parts.some(v=>v<0))throw new TypeError('Donut needs nonnegative values and thickness smaller than size');
 const total=parts.reduce((a,b)=>a+b,0),r=(size-thick)/2,C=2*Math.PI*r;let offset=0;
 const circles=total?parts.map((value,i)=>{const length=value/total*C;const out=`<circle r="${r}" cx="${size/2}" cy="${size/2}" fill="none" stroke="var(--chart-${i+1}, var(--c-accent))" stroke-width="${thick}" stroke-dasharray="${Math.max(0,length-2)} ${C-Math.max(0,length-2)}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size/2} ${size/2})"/>`;offset+=length;return out;}).join(''):'';
 return `<svg viewBox="0 0 ${size} ${size}" class="chart donut" role="img" aria-label="${escapeLabel(label)}"><circle r="${r}" cx="${size/2}" cy="${size/2}" fill="none" stroke="var(--c-sunken)" stroke-width="${thick}"/>${circles}</svg>`;
}
export function mount(root=document) {
 for(const el of root.querySelectorAll('[data-chart]')) {
  try { const render={sparkline,area,bars,donut}[el.dataset.chart];if(!render)throw new TypeError('Unknown chart type');el.innerHTML=render(JSON.parse(el.dataset.values||'[]'),{label:el.getAttribute('aria-label')||el.dataset.chart});delete el.dataset.chartError; }
  catch(error){el.textContent='Chart data unavailable.';el.dataset.chartError=error.message;}
 }
}

/** Bind range controls to an immutable source series. Returns cleanup. */
export function createChartRanges(root = document) {
  if(root.__colibriChartRanges)return root.__colibriChartRanges;
  const cleanups = [];
  for (const group of root.querySelectorAll('.seg[data-target]')) {
    const chart = root.querySelector(`[id="${CSS.escape(group.dataset.target)}"]`);
    if (!chart || group.dataset.chartBound) continue;
    let source;
    try {
      source=JSON.parse(chart.dataset.values);
      if(chart.dataset.chart==='area'){if(!Array.isArray(source))throw new TypeError('Invalid series');source.forEach(numbers);}else numbers(source);
    } catch { mount(chart.parentElement); continue; }
    group.dataset.chartBound = 'true';
    const lines = chart.parentElement.querySelector('.chart-data pre');
    const sourceLines = lines?.textContent.trim().split('\n');
    const update = button => {
      const n = Number(button.dataset.n);
      if (!Number.isInteger(n) || n <= 0) return;
      chart.dataset.values = JSON.stringify(Array.isArray(source[0]) ? source.map(s => s.slice(-n)) : source.slice(-n));
      mount(chart.parentElement);
      for (const item of group.querySelectorAll('button[data-n]')) item.setAttribute('aria-pressed', String(item === button));
      if (lines) lines.textContent = sourceLines.slice(-n).join('\n');
      chart.dispatchEvent(new chart.ownerDocument.defaultView.Event('chartchange'));
    };
    const onClick = event => { const button = event.target.closest('button[data-n]'); if (button && group.contains(button)) update(button); };
    group.addEventListener('click', onClick);
    const selected = group.querySelector('[aria-pressed="true"]');
    if (selected) update(selected);
    cleanups.push(() => { group.removeEventListener('click', onClick); delete group.dataset.chartBound; chart.dataset.values=JSON.stringify(source); if(lines)lines.textContent=sourceLines.join('\n'); });
  }
  return cleanupController(root,'__colibriChartRanges',()=>cleanups.forEach(cleanup=>cleanup()));
}

/** Enhance a server-rendered chart panel. The table is its data source. */
export function createChartPanel(root) {
  if(root.__colibriChartPanel)return root.__colibriChartPanel;
  const chart = root.querySelector('[data-chart]');
  const rows = [...root.querySelectorAll('tbody tr')];
  const labels = [...root.querySelectorAll('thead th')].slice(1);
  const series = labels.map((_, column) => rows.map(row => Number(row.querySelectorAll('td')[column].textContent)));
  chart.dataset.values = JSON.stringify(series);
  const update = () => {
    const n = JSON.parse(chart.dataset.values)[0]?.length || 0;
    rows.forEach((row,i) => { row.hidden = i < rows.length - n; });
    const status = root.querySelector('[role="status"]');
    if (status) status.textContent = `Showing ${n} days`;
  };
  chart.addEventListener('chartchange', update);
  const destroy = createChartRanges(root);
  update();
  return cleanupController(root,'__colibriChartPanel',()=>{destroy();chart.removeEventListener('chartchange',update);rows.forEach(row=>row.hidden=false);});
}
