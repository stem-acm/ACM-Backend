import { sql } from 'drizzle-orm';
import xlsx from 'xlsx';
import { db } from '@/db/drizzle';
import type { NewMember } from '@/db/schema';
import { members } from '@/db/schema';

const EXCEL_PATH = '/run/media/ianel/88CA3231CA321BBE/Projets/iPass/DATA/1MainData.xlsx';

// Column index mapping (0-indexed):
// 0: IdMembre      → registrationNumber
// 1: Photo         → profileImage
// 2: Categorie     → title (Miss/Mr/Mrs)
// 3: Prenom        → firstName
// 4: Nom           → lastName
// 5: Adresse       → address
// 6: DateNaissance → birthDate
// 7: LieuNaissance → birthPlace
// 8: Genre         → gender (Male/Female)
// 9: LieuTravail   → studyOrWorkPlace
// 10: Telephone    → phoneNumber
// 11: DateEntree   → joinDate

function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const trimmed = dateStr.trim();

  // Try M/D/YY or M/D/YYYY
  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;

  const month = Number.parseInt(parts[0], 10);
  const day = Number.parseInt(parts[1], 10);
  let year = Number.parseInt(parts[2], 10);

  if (Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Handle 2-digit years (born between 1980s-2020s)
  if (year < 100) {
    year = year <= 30 ? 2000 + year : 1900 + year;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function sanitizeGender(gender: string): 'male' | 'female' | null {
  if (!gender) return null;
  const g = gender.trim().toLowerCase();
  if (g === 'male' || g === 'female') return g;
  return null;
}

function sanitizeTitle(title: string): 'Miss' | 'Mr' | 'Mrs' | null {
  if (!title) return null;
  const t = title.trim();
  if (t === 'Miss' || t === 'Mr' || t === 'Mrs') return t;
  return null;
}

function sanitizeString(val: string): string | null {
  if (!val || val.trim() === '') return null;
  return val.trim();
}

async function importMembers() {
  console.log(`Reading Excel file: ${EXCEL_PATH}`);
  const wb = xlsx.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];

  // raw: false returns formatted strings (dates appear as "M/D/YY" instead of serial numbers)
  const rows = xlsx.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
  const headerRow = rows[0];
  console.log(`Headers: ${headerRow.join(', ')}`);
  console.log(`Total rows (incl. header): ${rows.length}`);

  const membersToInsert: NewMember[] = [];
  let skippedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const idRaw = (row[0] ?? '').toString().trim();

    // Skip empty rows
    if (!idRaw && !row[3]?.toString().trim()) {
      skippedCount++;
      continue;
    }

    const registrationNumber = idRaw ? Number.parseInt(idRaw, 10) : undefined;
    if (registrationNumber !== undefined && Number.isNaN(registrationNumber)) {
      console.warn(`Row ${i + 1}: Invalid IdMembre "${idRaw}", skipping`);
      skippedCount++;
      continue;
    }

    const firstName = sanitizeString(row[3]?.toString() ?? '');
    if (!firstName) {
      console.warn(`Row ${i + 1}: Missing first name, skipping`);
      skippedCount++;
      continue;
    }

    const member: NewMember = {
      firstName,
      lastName: sanitizeString(row[4]?.toString() ?? ''),
      title: sanitizeTitle(row[2]?.toString() ?? ''),
      gender: sanitizeGender(row[8]?.toString() ?? ''),
      birthDate: parseDate(row[6]?.toString() ?? ''),
      birthPlace: sanitizeString(row[7]?.toString() ?? ''),
      address: sanitizeString(row[5]?.toString() ?? ''),
      phoneNumber: sanitizeString(row[10]?.toString() ?? ''),
      studyOrWorkPlace: sanitizeString(row[9]?.toString() ?? ''),
      joinDate: parseDate(row[11]?.toString() ?? ''),
      profileImage: sanitizeString(row[1]?.toString() ?? ''),
    };

    if (registrationNumber !== undefined) {
      member.registrationNumber = registrationNumber;
    }

    membersToInsert.push(member);
  }

  console.log(`\nParsed ${membersToInsert.length} valid members (skipped ${skippedCount} rows)`);

  if (membersToInsert.length === 0) {
    console.log('No members to insert. Exiting.');
    return;
  }

  // Summary stats
  const withTitle = membersToInsert.filter((m) => m.title).length;
  const withGender = membersToInsert.filter((m) => m.gender).length;
  const withBirthDate = membersToInsert.filter((m) => m.birthDate).length;
  const withBirthPlace = membersToInsert.filter((m) => m.birthPlace).length;
  const withPhone = membersToInsert.filter((m) => m.phoneNumber).length;
  const withJoinDate = membersToInsert.filter((m) => m.joinDate).length;
  const withStudyWork = membersToInsert.filter((m) => m.studyOrWorkPlace).length;
  const withAddress = membersToInsert.filter((m) => m.address).length;
  const withPhoto = membersToInsert.filter((m) => m.profileImage).length;

  console.log('\nData quality summary:');
  console.log(`  Title:          ${withTitle}/${membersToInsert.length}`);
  console.log(`  Gender:         ${withGender}/${membersToInsert.length}`);
  console.log(`  Birth date:     ${withBirthDate}/${membersToInsert.length}`);
  console.log(`  Birth place:    ${withBirthPlace}/${membersToInsert.length}`);
  console.log(`  Phone:          ${withPhone}/${membersToInsert.length}`);
  console.log(`  Join date:      ${withJoinDate}/${membersToInsert.length}`);
  console.log(`  Study/Work:     ${withStudyWork}/${membersToInsert.length}`);
  console.log(`  Address:        ${withAddress}/${membersToInsert.length}`);
  console.log(`  Profile photo:  ${withPhoto}/${membersToInsert.length}`);

  // Sample row preview
  console.log('\nFirst 3 members to insert:');
  for (let i = 0; i < Math.min(3, membersToInsert.length); i++) {
    console.log(`  ${JSON.stringify(membersToInsert[i])}`);
  }

  console.log('\nStarting database insert...');

  try {
    // Insert in batches of 500 to avoid overwhelming the connection
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < membersToInsert.length; i += BATCH_SIZE) {
      const batch = membersToInsert.slice(i, i + BATCH_SIZE);
      const result = await db
        .insert(members)
        .values(batch)
        .returning({ id: members.registrationNumber });
      inserted += result.length;
      console.log(
        `Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.length} members (total: ${inserted})`
      );
    }

    // Reset the serial sequence to the max ID so future auto-inserts don't conflict
    const maxId = Math.max(
      ...membersToInsert
        .map((m) => (m as Record<string, unknown>).registrationNumber as number)
        .filter(Boolean)
    );
    if (maxId > 0) {
      await db.execute(sql`SELECT setval('members_registration_number_seq', ${maxId})`);
      console.log(`Reset sequence to: ${maxId}`);
    }

    console.log(`\nSuccessfully imported ${inserted} members!`);
  } catch (error) {
    console.error('Error during import:', error);
    throw error;
  }
}

importMembers()
  .then(() => {
    console.log('Import script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import script failed:', error);
    process.exit(1);
  });
