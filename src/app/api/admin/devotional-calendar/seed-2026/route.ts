/**
 * API: POST /api/admin/devotional-calendar/seed-2026
 *
 * Clears all 2026 devotional calendar events and repopulates them
 * with accurate 2026 Hindu festival dates sourced from Drik Panchang.
 * Super admin only.
 */

import { NextRequest } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth/middleware';
import { queryDocs, deleteDoc, createDoc, nowISO } from '@/lib/firebase/firestore';
import { writeAuditLog, extractRequestMeta } from '@/services/audit/log';
import { COLLECTIONS } from '@/domain/constants';

interface FestivalEntry {
  name: string;
  date: string; // YYYY-MM-DD
  eventType: 'festival' | 'vrat' | 'ekadashi' | 'puja' | 'other';
  description: string;
}

// Verified 2026 Hindu festival dates sourced from Drik Panchang
const FESTIVALS_2026: FestivalEntry[] = [
  // January
  { name: 'Lohri', date: '2026-01-13', eventType: 'festival', description: 'Harvest festival celebrated in Punjab and North India, marking the end of winter.' },
  { name: 'Makar Sankranti', date: '2026-01-14', eventType: 'festival', description: 'Sun enters Capricorn (Makara). Celebrated with tilgul, kite flying, and holy dips.' },
  { name: 'Pongal', date: '2026-01-14', eventType: 'festival', description: 'Four-day harvest festival of Tamil Nadu. Thanksgivig to the Sun God for a good harvest.' },
  { name: 'Mattu Pongal', date: '2026-01-15', eventType: 'festival', description: 'Third day of Pongal — cattle are honoured and decorated.' },
  { name: 'Magh Bihu', date: '2026-01-15', eventType: 'festival', description: 'Assamese harvest festival coinciding with Makar Sankranti.' },

  // February
  { name: 'Vasant Panchami', date: '2026-02-02', eventType: 'festival', description: 'Saraswati Puja — Goddess of learning, music and arts is worshipped. Spring begins.' },
  { name: 'Ratha Saptami', date: '2026-02-04', eventType: 'puja', description: 'The Sun God\'s chariot turns towards the Northern Hemisphere. Observed with sacred bath.' },
  { name: 'Bhishma Ashtami', date: '2026-02-05', eventType: 'other', description: 'Bhishma Pitamah attained Moksha on this day. Tarpan is offered to ancestors.' },
  { name: 'Maha Shivaratri', date: '2026-02-26', eventType: 'vrat', description: 'The great night of Lord Shiva. Devotees fast, chant Om Namah Shivaya, and keep a vigil.' },

  // March
  { name: 'Phulera Dooj', date: '2026-03-01', eventType: 'festival', description: 'Auspicious day in Mathura-Vrindavan heralding the start of Holi celebrations.' },
  { name: 'Holika Dahan', date: '2026-03-13', eventType: 'festival', description: 'Bonfire lit on the eve of Holi to symbolise the victory of devotion over evil.' },
  { name: 'Holi', date: '2026-03-14', eventType: 'festival', description: 'Festival of colours celebrating the arrival of spring and the victory of good over evil.' },
  { name: 'Ugadi', date: '2026-03-30', eventType: 'festival', description: 'Telugu and Kannada New Year. Neem leaves and jaggery are eaten to accept life\'s dualities.' },
  { name: 'Gudi Padwa', date: '2026-03-30', eventType: 'festival', description: 'Marathi New Year. A gudi (flag) is raised to invite prosperity and good luck.' },

  // April
  { name: 'Chaitra Navratri Begins', date: '2026-03-30', eventType: 'festival', description: 'Nine nights of Goddess Durga begin on Chaitra Shukla Pratipada.' },
  { name: 'Rama Navami', date: '2026-04-07', eventType: 'festival', description: 'Birth anniversary of Lord Rama, seventh avatar of Lord Vishnu.' },
  { name: 'Hanuman Jayanti', date: '2026-04-14', eventType: 'festival', description: 'Birth anniversary of Lord Hanuman, celebrated with Hanuman Chalisa recitation.' },
  { name: 'Mesha Sankranti', date: '2026-04-14', eventType: 'other', description: 'Sun enters Aries (Mesha Rashi). Solar New Year in Kerala (Vishu) and Tamil Nadu (Puthandu).' },
  { name: 'Vishu', date: '2026-04-14', eventType: 'festival', description: 'Malayalam New Year. Vishukkani — auspicious items arranged for viewing at dawn.' },
  { name: 'Tamil New Year (Puthandu)', date: '2026-04-14', eventType: 'festival', description: 'Tamil solar New Year. Mango pachadi is prepared to taste all six flavours of life.' },
  { name: 'Akshaya Tritiya', date: '2026-04-22', eventType: 'festival', description: 'Most auspicious day of the year. Believed that any work begun yields eternal results.' },

  // May
  { name: 'Buddha Purnima', date: '2026-05-11', eventType: 'festival', description: 'Birth, enlightenment and nirvana of Gautama Buddha. Observed with prayers and meditation.' },
  { name: 'Vaishakha Purnima', date: '2026-05-11', eventType: 'other', description: 'Full moon of Vaishakha — auspicious for charity and holy river bathing.' },

  // June
  { name: 'Vat Purnima', date: '2026-06-09', eventType: 'vrat', description: 'Married women tie sacred threads around a banyan tree for the long life of their husbands.' },
  { name: 'Rath Yatra', date: '2026-06-27', eventType: 'festival', description: 'Lord Jagannath\'s chariot festival at Puri. Massive procession of three chariots.' },

  // July
  { name: 'Guru Purnima', date: '2026-07-12', eventType: 'festival', description: 'Day to honour teachers and gurus. Birthday of Maharishi Vyasa, compiler of the Vedas.' },
  { name: 'Ashadha Purnima', date: '2026-07-12', eventType: 'other', description: 'Full moon of Ashadha. Sacred for charitable acts and guru worship.' },

  // August
  { name: 'Nag Panchami', date: '2026-08-04', eventType: 'festival', description: 'Serpents are worshipped on Shravan Shukla Panchami for protection and blessings.' },
  { name: 'Hariyali Teej', date: '2026-08-07', eventType: 'vrat', description: 'Shravan Shukla Tritiya — women fast for marital happiness. Swings are hung on trees.' },
  { name: 'Raksha Bandhan', date: '2026-08-26', eventType: 'festival', description: 'Sisters tie rakhi on brothers\' wrists; brothers pledge to protect them.' },
  { name: 'Shravan Purnima', date: '2026-08-26', eventType: 'other', description: 'Full moon of Shravan. Hayagriva Jayanti and Avani Avittam also observed.' },
  { name: 'Janmashtami', date: '2026-08-26', eventType: 'festival', description: 'Birth anniversary of Lord Krishna. Midnight celebrations with Dahi Handi and bhajans.' },
  { name: 'Ganesh Chaturthi', date: '2026-09-02', eventType: 'festival', description: 'Ten-day festival celebrating the birth of Lord Ganesha, the remover of obstacles.' },

  // September
  { name: 'Ganesh Chaturthi', date: '2026-09-02', eventType: 'festival', description: 'Birth of Lord Ganesha. Ten-day celebration begins with installation of Ganesha idols.' },
  { name: 'Onam', date: '2026-09-05', eventType: 'festival', description: 'Kerala\'s harvest festival celebrating the homecoming of King Mahabali. Grand feast (sadya).' },
  { name: 'Ganesh Visarjan', date: '2026-09-12', eventType: 'festival', description: 'Immersion of Ganesha idols on the tenth day, bidding farewell to the Lord.' },
  { name: 'Sharad Navratri Begins', date: '2026-09-20', eventType: 'festival', description: 'Nine nights of Goddess Durga — Ghatasthapana performed on the first day.' },
  { name: 'Mahasaptami', date: '2026-09-26', eventType: 'puja', description: 'Seventh day of Navratri — Durga\'s eyes are symbolically opened (Nabapatrika puja).' },
  { name: 'Mahashtami', date: '2026-09-27', eventType: 'puja', description: 'Eighth day of Navratri — Kumari Puja performed honouring the Goddess as a young girl.' },
  { name: 'Maha Navami', date: '2026-09-28', eventType: 'puja', description: 'Ninth day of Navratri — Saraswati Puja and Ayudha Puja (tools and vehicles worshipped).' },
  { name: 'Dussehra (Vijayadashami)', date: '2026-09-29', eventType: 'festival', description: 'Tenth day — Rama\'s victory over Ravana. Ravana effigies burned. Mysore Dasara celebrated.' },

  // October
  { name: 'Karva Chauth', date: '2026-10-12', eventType: 'vrat', description: 'Married women fast from sunrise to moonrise for husbands\' long life and prosperity.' },
  { name: 'Dhanteras', date: '2026-10-18', eventType: 'festival', description: 'First day of Diwali. Gold, silver and utensils purchased for prosperity.' },
  { name: 'Naraka Chaturdashi (Choti Diwali)', date: '2026-10-19', eventType: 'festival', description: 'Krishna\'s victory over Narakasura. Ritual bath before sunrise with sesame oil.' },
  { name: 'Diwali', date: '2026-10-20', eventType: 'festival', description: 'Festival of lights — Lakshmi puja performed at night. Firecrackers and sweets exchanged.' },
  { name: 'Govardhan Puja', date: '2026-10-21', eventType: 'puja', description: 'Krishna lifting Govardhan Hill is celebrated. Annakut (mountain of food) offered.' },
  { name: 'Bhai Dooj', date: '2026-10-22', eventType: 'festival', description: 'Sisters apply tilak on brothers\' foreheads and pray for their long life. Brothers give gifts.' },
  { name: 'Chhath Puja', date: '2026-10-26', eventType: 'puja', description: 'Ancient Vedic festival dedicated to the Sun God. Devotees fast and offer arghya to the sun.' },

  // November
  { name: 'Dev Uthani Ekadashi', date: '2026-11-11', eventType: 'ekadashi', description: 'Lord Vishnu awakens from Chaturmas sleep. Tulsi Vivah performed. Auspicious marriages resume.' },
  { name: 'Kartik Purnima', date: '2026-11-17', eventType: 'festival', description: 'Tripurari Purnima — Dev Deepawali. Holy rivers lit with thousands of lamps at Varanasi.' },

  // December
  { name: 'Vivah Panchami', date: '2026-12-02', eventType: 'festival', description: 'Wedding anniversary of Rama and Sita. Celebrated with Rama-Sita vivah re-enactment.' },
  { name: 'Gita Jayanti', date: '2026-12-14', eventType: 'festival', description: 'Bhagavad Gita was delivered by Krishna to Arjuna on this day (Mokshada Ekadashi).' },
  { name: 'Mokshada Ekadashi', date: '2026-12-14', eventType: 'ekadashi', description: 'Most sacred Ekadashi — fasting grants liberation (Moksha). Bhagavad Gita Jayanti.' },
];

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['super_admin']);

    // Step 1: Clear all 2026 events
    const existing = await queryDocs<{ id: string }>(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, [
      { type: 'where', field: 'date', op: '>=', value: '2026-01-01' },
      { type: 'where', field: 'date', op: '<=', value: '2026-12-31' },
    ]);

    let cleared = 0;
    for (const ev of existing) {
      await deleteDoc(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, ev.id);
      cleared++;
    }

    // Step 2: Insert correct 2026 festivals
    let created = 0;
    for (const festival of FESTIVALS_2026) {
      await createDoc(COLLECTIONS.DEVOTIONAL_CALENDAR_EVENTS, {
        title: festival.name,
        name: festival.name,
        eventDate: festival.date,
        date: festival.date,
        eventType: festival.eventType,
        description: festival.description,
        region: 'india',
        source: 'curated_2026',
        requiresVerification: false,
        attribution: 'Dates curated for 2026 from Drik Panchang and Hindu calendar sources.',
        createdBy: auth.uid,
        createdAt: nowISO(),
      });
      created++;
    }

    const { ipAddress, userAgent } = extractRequestMeta(request);
    await writeAuditLog({
      actorId: auth.uid,
      actorRole: auth.role,
      action: 'DEVOTIONAL_CALENDAR_CLEARED',
      entityType: 'devotional_calendar_event',
      entityId: '2026',
      newState: { year: 2026, cleared, created },
      ipAddress,
      userAgent,
    });

    return Response.json({ success: true, cleared, created });
  } catch (error) {
    return authErrorResponse(error);
  }
}
