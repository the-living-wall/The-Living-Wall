export const steps = [
 ['空墙','把手和身体移出白框，保持墙面空置。',15],
 ['手掌悬空','手掌放在白框中央，离墙约 10 厘米，保持不动。',10],
 ['手掌靠近','手掌慢慢靠近到离墙约 3 厘米，保持悬空。',10],
 ['手掌贴墙','轻轻把手掌贴在墙上，保持不动。',10],
 ['抬手离开','手离开墙面并退出白框。',10],
 ['前臂参与','前臂伸入白框，手掌靠近墙，慢慢左右移动。',15],
 ['上半身靠近','手放下，上半身慢慢靠近再退开，不要挤压设备。',15],
 ['双手靠近','两只手分开放在白框内，靠墙约 3 厘米，保持悬空。',10],
 ['恢复空墙','手和身体全部移开，保持空墙。',10],
];
export class Guide {
 constructor(){this.report=null;this.phase='idle';this.index=0;}
 start(mode,roi,at=Date.now()){
  this.report={version:2,started_at:new Date(at).toISOString(),source:mode==='simulation'?'simulation':'camera',mode,roi:[...roi],status:'running',steps:[],samples:[],events:[],note:'仅数值，无图像或轮廓。动作是提示与用户自报，非自动验证；轮询样本不等于独立相机帧。'};
  this.index=0;this.phase='ready';
 }
 ready(at=Date.now()) {this.phase='prepare';this.deadline=at+5000;}
 tick(at=Date.now()) {
  if(this.phase==='prepare'&&at>=this.deadline){this.phase='record';this.deadline=at+steps[this.index][2]*1000;}
  if(this.phase==='record'&&at>=this.deadline){this.phase='confirm';}
 }
 sample(d,at=Date.now()){
  if(!['prepare','record'].includes(this.phase))return;
  if(d.mode!==this.report.mode || d.age_ms==null || d.age_ms>1500 || ['uncalibrated','calibrating'].includes(d.result?.state)) {this.report.events.push({at,reason:'断流、模式切换或校准变化',step:this.index});this.phase='interrupted';return;}
  if(this.phase!=='record')return;
  const r=d.result||{};
  this.report.samples.push({at,step:this.index,state:r.state,age_ms:d.age_ms,valid_ratio:r.valid_ratio??null,diagnostic_valid:!!r.diagnostic_valid,foreground_count:(r.regions||[]).length,near_count:(r.near_regions||[]).length,near_gaps_mm:(r.near_regions||[]).map(v=>v.gap_mm),background_model:r.background_model??'legacy',region_metrics:(r.regions||[]).map(v=>({area_px:v.area_px,center:v.center,gap_mm:v.gap_mm})),near_region_metrics:(r.near_regions||[]).map(v=>({area_px:v.area_px,center:v.center,gap_mm:v.gap_mm})),contact_mm:r.contact_mm??null,noise_mm:r.noise_mm??null});
 }
 confirm(performed,at=Date.now()){
  this.report.steps.push({index:this.index,action:steps[this.index][0],performed,ended_at:at,interrupted:this.phase==='interrupted'});
  if(++this.index===steps.length){this.finish('completed',at);}else this.phase='ready';
 }
 finish(status='ended_early',at=Date.now()){this.report.status=status;this.report.ended_at=new Date(at).toISOString();this.phase='done';}
}
