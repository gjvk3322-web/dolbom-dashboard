/**
 * 돌봄매트 마케팅 대시보드 API
 * ================================
 * 이 코드를 구글시트 > 확장 프로그램 > Apps Script에 붙여넣기 하세요.
 *
 * 설치 방법:
 * 1. 구글시트 열기 (돌봄매트 시트)
 * 2. 상단 메뉴: 확장 프로그램 > Apps Script
 * 3. 기존 코드 전체 삭제 후, 이 코드 전체를 복사-붙여넣기
 * 4. 저장 (Ctrl+S)
 * 5. 배포 > 새 배포 > 유형: 웹 앱
 *    - 설명: 마케팅 대시보드 API
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 6. 배포 → 나오는 URL을 복사해서 marketing.html에 입력
 */

// ============================================
// 메인 API 핸들러
// ============================================

function doGet(e) {
  try {
    const type = (e && e.parameter && e.parameter.type) || 'dashboard';
    let result;

    switch(type) {
      case 'dashboard':
        result = getDashboardData();
        break;
      case 'samples':
        result = getSampleData();
        break;
      case 'schedules':
        result = getScheduleData();
        break;
      case 'conversion':
        result = getConversionData();
        break;
      case 'channel':
        result = getChannelAnalysis();
        break;
      default:
        result = getDashboardData();
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  return doGet(e);
}

// ============================================
// 대시보드 종합 데이터
// ============================================

function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 샘플접수 데이터
  const sampleSheet = ss.getSheetByName('샘플접수');
  const sampleData = getSheetData(sampleSheet);

  // 시공스케줄 데이터 (부산 + 경기)
  const busanSheet = ss.getSheetByName('시공스케줄(부산)');
  const gyeonggiSheet = ss.getSheetByName('시공스케줄(경기)');
  const busanData = getSheetData(busanSheet);
  const gyeonggiData = getSheetData(gyeonggiSheet);
  const scheduleData = busanData.concat(gyeonggiData);

  // 기간 계산
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // 이번 달 샘플접수
  const thisMonthSamples = sampleData.filter(r => {
    const d = parseDate(r['접수일시']);
    return d && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  // 이번 달 시공
  const thisMonthSchedules = scheduleData.filter(r => {
    const d = parseDate(r['시공일']);
    return d && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  // 이번 달 매출
  const thisMonthRevenue = thisMonthSchedules.reduce((sum, r) => {
    const amount = parseAmount(r['판매금액']);
    return sum + amount;
  }, 0);

  // 채널별 샘플접수
  const channelSamples = {};
  thisMonthSamples.forEach(r => {
    const ch = normalizeChannel(r['유입경로'] || '기타');
    channelSamples[ch] = (channelSamples[ch] || 0) + 1;
  });

  // 채널별 시공(예약) - 전환된 건
  const channelSchedules = {};
  thisMonthSchedules.forEach(r => {
    const ch = normalizeChannel(r['유입경로'] || '기타');
    channelSchedules[ch] = (channelSchedules[ch] || 0) + 1;
  });

  // 전환율 계산 (연락처 매칭)
  const conversion = calculateConversion(sampleData, scheduleData);

  // 일별 추이 (최근 30일)
  const dailyTrend = getDailyTrend(sampleData, scheduleData, 30);

  // 지역별 통계
  const regionStats = getRegionStats(sampleData);

  return {
    timestamp: now.toISOString(),
    summary: {
      thisMonth: {
        samples: thisMonthSamples.length,
        schedules: thisMonthSchedules.length,
        revenue: thisMonthRevenue,
        conversionRate: thisMonthSamples.length > 0
          ? Math.round(thisMonthSchedules.length / thisMonthSamples.length * 100)
          : 0
      },
      total: {
        samples: sampleData.length,
        schedules: scheduleData.length
      }
    },
    channelSamples: channelSamples,
    channelSchedules: channelSchedules,
    conversion: conversion,
    dailyTrend: dailyTrend,
    regionStats: regionStats
  };
}

// ============================================
// 샘플 접수 데이터
// ============================================

function getSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('샘플접수');
  const data = getSheetData(sheet);

  return {
    total: data.length,
    data: data.slice(-100) // 최근 100건
  };
}

// ============================================
// 시공 스케줄 데이터
// ============================================

function getScheduleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const busanSheet = ss.getSheetByName('시공스케줄(부산)');
  const gyeonggiSheet = ss.getSheetByName('시공스케줄(경기)');

  const busanData = getSheetData(busanSheet).map(r => ({...r, 지역: '부산'}));
  const gyeonggiData = getSheetData(gyeonggiSheet).map(r => ({...r, 지역: '경기'}));

  return {
    busan: busanData.length,
    gyeonggi: gyeonggiData.length,
    total: busanData.length + gyeonggiData.length,
    data: busanData.concat(gyeonggiData).slice(-100)
  };
}

// ============================================
// 전환율 분석 (핵심!)
// ============================================

function getConversionData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sampleSheet = ss.getSheetByName('샘플접수');
  const busanSheet = ss.getSheetByName('시공스케줄(부산)');
  const gyeonggiSheet = ss.getSheetByName('시공스케줄(경기)');

  const sampleData = getSheetData(sampleSheet);
  const scheduleData = getSheetData(busanSheet).concat(getSheetData(gyeonggiSheet));

  return calculateConversion(sampleData, scheduleData);
}

function calculateConversion(sampleData, scheduleData) {
  // 시공 스케줄의 연락처 세트
  const scheduledPhones = new Set();
  scheduleData.forEach(r => {
    const phone = normalizePhone(r['연락처']);
    if (phone) scheduledPhones.add(phone);
  });

  // 채널별 전환 분석
  const channelConversion = {};

  sampleData.forEach(r => {
    const phone = normalizePhone(r['연락처']);
    const channel = normalizeChannel(r['유입경로'] || '기타');

    if (!channelConversion[channel]) {
      channelConversion[channel] = { samples: 0, converted: 0, rate: 0 };
    }
    channelConversion[channel].samples++;

    if (phone && scheduledPhones.has(phone)) {
      channelConversion[channel].converted++;
    }
  });

  // 전환율 계산
  let totalSamples = 0, totalConverted = 0;
  Object.keys(channelConversion).forEach(ch => {
    const c = channelConversion[ch];
    c.rate = c.samples > 0 ? Math.round(c.converted / c.samples * 1000) / 10 : 0;
    totalSamples += c.samples;
    totalConverted += c.converted;
  });

  // 채널별 매출
  const channelRevenue = {};
  scheduleData.forEach(r => {
    const ch = normalizeChannel(r['유입경로'] || '기타');
    const amount = parseAmount(r['판매금액']);
    channelRevenue[ch] = (channelRevenue[ch] || 0) + amount;
  });

  return {
    overall: {
      samples: totalSamples,
      converted: totalConverted,
      rate: totalSamples > 0 ? Math.round(totalConverted / totalSamples * 1000) / 10 : 0
    },
    byChannel: channelConversion,
    revenueByChannel: channelRevenue
  };
}

// ============================================
// 채널 분석
// ============================================

function getChannelAnalysis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sampleSheet = ss.getSheetByName('샘플접수');
  const busanSheet = ss.getSheetByName('시공스케줄(부산)');
  const gyeonggiSheet = ss.getSheetByName('시공스케줄(경기)');

  const sampleData = getSheetData(sampleSheet);
  const scheduleData = getSheetData(busanSheet).concat(getSheetData(gyeonggiSheet));

  // 월별 채널 추이
  const monthlyChannel = {};
  sampleData.forEach(r => {
    const d = parseDate(r['접수일시']);
    if (!d) return;
    const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const channel = normalizeChannel(r['유입경로'] || '기타');

    if (!monthlyChannel[monthKey]) monthlyChannel[monthKey] = {};
    monthlyChannel[monthKey][channel] = (monthlyChannel[monthKey][channel] || 0) + 1;
  });

  return {
    monthlyChannel: monthlyChannel,
    conversion: calculateConversion(sampleData, scheduleData)
  };
}

// ============================================
// 일별 추이
// ============================================

function getDailyTrend(sampleData, scheduleData, days) {
  const result = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);

    const daySamples = sampleData.filter(r => {
      const rd = parseDate(r['접수일시']);
      return rd && formatDate(rd) === dateStr;
    }).length;

    const daySchedules = scheduleData.filter(r => {
      const rd = parseDate(r['시공일']);
      return rd && formatDate(rd) === dateStr;
    }).length;

    result.push({
      date: dateStr,
      samples: daySamples,
      schedules: daySchedules
    });
  }

  return result;
}

// ============================================
// 지역별 통계
// ============================================

function getRegionStats(sampleData) {
  const regions = {};

  sampleData.forEach(r => {
    const addr = r['주소'] || '';
    const region = extractRegion(addr);
    regions[region] = (regions[region] || 0) + 1;
  });

  return regions;
}

// ============================================
// 유틸리티 함수들
// ============================================

function getSheetData(sheet) {
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = {};
    let hasData = false;

    headers.forEach((h, j) => {
      const val = data[i][j];
      if (val !== '' && val !== null && val !== undefined) hasData = true;
      row[h] = val;
    });

    if (hasData) rows.push(row);
  }

  return rows;
}

function normalizePhone(phone) {
  if (!phone) return null;
  // 숫자만 추출
  const digits = String(phone).replace(/\D/g, '');
  // 앞에 0 붙이기 (구글시트에서 010이 10으로 저장될 수 있음)
  if (digits.length === 10 && !digits.startsWith('0')) {
    return '0' + digits;
  }
  return digits;
}

function normalizeChannel(channel) {
  if (!channel) return '기타';
  const ch = String(channel).trim().toLowerCase();

  // 검색 계열
  if (ch.includes('네이버') && (ch.includes('검색') || ch.includes('서치'))) return '네이버검색';
  if (ch.includes('인터넷') && ch.includes('검색')) return '인터넷검색';
  if (ch === '검색' || ch === '네이버') return '네이버검색';
  if (ch.includes('구글')) return '구글검색';

  // 블로그
  if (ch.includes('블로그') || ch.includes('blog')) return '블로그';
  if (ch.includes('네이버') && ch.includes('블로그')) return '블로그';

  // 인스타그램
  if (ch.includes('인스타') || ch.includes('instagram') || ch.includes('insta')) return '인스타그램';

  // 맘카페/커뮤니티
  if (ch.includes('맘카페') || ch.includes('맘까페') || ch.includes('카페')) return '맘카페';
  if (ch.includes('커뮤니티') || ch.includes('커뮤')) return '맘카페';

  // 추천/소개
  if (ch.includes('지인') || ch.includes('추천') || ch.includes('소개') || ch.includes('친구')) return '지인추천';
  if (ch.includes('가족') || ch.includes('엄마') || ch.includes('언니') || ch.includes('동생')) return '지인추천';

  // 유튜브
  if (ch.includes('유튜브') || ch.includes('youtube')) return '유튜브';

  // 당근
  if (ch.includes('당근') || ch.includes('마켓')) return '당근마켓';

  // 네이버 광고
  if (ch.includes('광고') || ch.includes('네이버광고') || ch.includes('파워링크')) return '네이버광고';

  // 시공매트 브랜드
  if (ch.includes('돌봄') || ch.includes('브랜드')) return '브랜드검색';

  // 챗지피티/AI
  if (ch.includes('챗') || ch.includes('gpt') || ch.includes('ai')) return 'AI검색';

  return channel.trim() || '기타';
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;

  const str = String(val).trim();

  // "2026. 4. 6" 형식
  const m1 = str.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m1) return new Date(parseInt(m1[1]), parseInt(m1[2]) - 1, parseInt(m1[3]));

  // "2026-04-01" 형식
  const m2 = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));

  // Date 객체로 시도
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseAmount(val) {
  if (!val) return 0;
  const str = String(val).replace(/[^0-9]/g, '');
  return parseInt(str) || 0;
}

function formatDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function extractRegion(address) {
  if (!address) return '기타';
  const addr = String(address);

  // 광역시/도 추출
  const regions = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

  for (const r of regions) {
    if (addr.includes(r)) return r;
  }
  return '기타';
}
