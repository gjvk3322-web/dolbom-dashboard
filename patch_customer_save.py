for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        c = f.read()
    
    team = '경기' if 'gg' in fn else '부산'
    
    # copyCustomerMsg 함수 끝부분: 클립보드 복사 직전에 보고서 저장 추가
    old = """try{
navigator.clipboard.writeText(msg).then(()=>showCustomerToast('📋 고객전달 복사완료!')).catch(()=>{
const ta=document.createElement('textarea');ta.value=msg;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
showCustomerToast('📋 고객전달 복사완료!');
});
}catch(e){showCustomerToast('📋 고객전달 복사완료!');}
}"""

    save_code = """// 고객전달 시 보고서 데이터도 저장
const dc2=document.querySelectorAll('.rDiscount:checked');
const ds2=dc2.length?Array.from(dc2).map(x=>x.dataset.name).join('+'):'없음';
const dt2=Array.from(dc2).reduce((s,c)=>s+(parseInt(c.value)||0),0);
const rd2={date:g('rDate'),ref:g('rRef'),team:g('rTeam'),region:g('rRegion'),apt:g('rApt'),unit:g('rUnit'),phone:g('rPhone'),py:g('rPy'),color:g('rColor'),scope:g('rScope'),isNew:g('rNew'),installFee:g('rInstallFee'),gonggu:g('rGonggu'),coupon:dt2.toString(),couponNames:ds2,pay:g('rPay'),qty:parseInt(g('rQty'))||0,price:g('rPrice'),paid:g('rPaid'),unpaid:g('rUnpaid'),receipt:g('rReceipt'),note:g('rNote'),submittedAt:new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})};
if(typeof reportJobId!=='undefined'&&reportJobId){
  fbSave('reports/'+reportJobId,rd2);
  if(typeof SHEET_REPORT_URL!=='undefined'&&SHEET_REPORT_URL){
    const jp2=reportJobId.split('_');
    const sr2=parseInt(jp2[jp2.length-1])+1;
    fetch(SHEET_REPORT_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'reportToSchedule',scheduleTeam:'""" + team + """',row:sr2,...rd2,jobId:reportJobId})}).catch(()=>{});
  }
}

try{
navigator.clipboard.writeText(msg).then(()=>showCustomerToast('📋 고객전달 복사 + 보고서 저장 완료!')).catch(()=>{
const ta=document.createElement('textarea');ta.value=msg;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
showCustomerToast('📋 고객전달 복사 + 보고서 저장 완료!');
});
}catch(e){showCustomerToast('📋 고객전달 복사 + 보고서 저장 완료!');}
}"""

    if old in c:
        c = c.replace(old, save_code)
        with open(fn, 'w') as f:
            f.write(c)
        print(f'{fn}: 고객전달+보고서저장 패치 완료!')
    else:
        print(f'{fn}: 매칭 실패')
