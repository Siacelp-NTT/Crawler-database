const db = require('../services/database');
const logger = require('../services/logger');

async function findDuplicateCompanies() {
  console.log('\n🔍 Searching for duplicate companies...\n');
  
  const result = await db.cleanPool.query(`
    SELECT 
      LOWER(TRIM(Name)) as name_key,
      COUNT(*) as count,
      ARRAY_AGG(Id ORDER BY CreatedAt) as ids,
      ARRAY_AGG(Name) as names,
      ARRAY_AGG(Domain) as domains
    FROM Company
    GROUP BY LOWER(TRIM(Name))
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `);

  if (result.rows.length === 0) {
    console.log('✅ No duplicate companies found!\n');
    return [];
  }

  console.log(`⚠️  Found ${result.rows.length} duplicate company names:\n`);
  
  result.rows.forEach(row => {
    console.log(`  ${row.names[0]} (${row.count} duplicates)`);
    row.ids.forEach((id, index) => {
      console.log(`    - ${id} | ${row.names[index]} | ${row.domains[index] || 'no domain'}`);
    });
    console.log('');
  });

  return result.rows;
}

async function findDuplicateJobs() {
  console.log('🔍 Searching for duplicate jobs by URL...\n');
  
  const result = await db.cleanPool.query(`
    SELECT 
      PostUrl,
      COUNT(*) as count,
      ARRAY_AGG(Id ORDER BY CreatedAt) as ids,
      ARRAY_AGG(Title) as titles
    FROM JobPost
    GROUP BY PostUrl
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `);

  if (result.rows.length === 0) {
    console.log('✅ No duplicate jobs found by URL!\n');
  } else {
    console.log(`⚠️  Found ${result.rows.length} duplicate job URLs:\n`);
    
    result.rows.slice(0, 10).forEach(row => {
      console.log(`  ${row.titles[0]} (${row.count} duplicates)`);
      console.log(`    URL: ${row.posturl}`);
      row.ids.forEach((id, index) => {
        console.log(`    - ${id} | ${row.titles[index]}`);
      });
      console.log('');
    });
  }

  return result.rows;
}

async function mergeDuplicateCompanies(dryRun = true) {
  console.log('\n🔧 Merging duplicate companies...\n');
  
  const duplicates = await findDuplicateCompanies();
  
  if (duplicates.length === 0) {
    return { merged: 0, deleted: 0 };
  }

  let merged = 0;
  let deleted = 0;

  for (const dup of duplicates) {
    const keepId = dup.ids[0]; // Keep the oldest
    const deleteIds = dup.ids.slice(1); // Delete the rest

    console.log(`\nMerging: ${dup.names[0]}`);
    console.log(`  Keep: ${keepId}`);
    console.log(`  Delete: ${deleteIds.join(', ')}`);

    if (!dryRun) {
      try {
        // Update all job posts to reference the kept company
        await db.cleanPool.query(
          `UPDATE JobPost SET CompanyId = $1 WHERE CompanyId = ANY($2)`,
          [keepId, deleteIds]
        );

        // Delete duplicate companies
        await db.cleanPool.query(
          `DELETE FROM Company WHERE Id = ANY($1)`,
          [deleteIds]
        );

        merged++;
        deleted += deleteIds.length;
        console.log(`  ✅ Merged successfully`);
      } catch (error) {
        console.error(`  ❌ Error merging:`, error.message);
      }
    } else {
      console.log(`  ℹ️  Dry run - no changes made`);
    }
  }

  return { merged, deleted };
}

async function deleteDuplicateJobs(dryRun = true) {
  console.log('\n🔧 Removing duplicate jobs...\n');
  
  const duplicates = await findDuplicateJobs();
  
  if (duplicates.length === 0) {
    return { deleted: 0 };
  }

  let deleted = 0;

  for (const dup of duplicates) {
    const keepId = dup.ids[0]; // Keep the oldest
    const deleteIds = dup.ids.slice(1); // Delete the rest

    console.log(`\nRemoving duplicates of: ${dup.titles[0]}`);
    console.log(`  Keep: ${keepId}`);
    console.log(`  Delete: ${deleteIds.join(', ')}`);

    if (!dryRun) {
      try {
        await db.cleanPool.query(
          `DELETE FROM JobPost WHERE Id = ANY($1)`,
          [deleteIds]
        );

        deleted += deleteIds.length;
        console.log(`  ✅ Deleted ${deleteIds.length} duplicates`);
      } catch (error) {
        console.error(`  ❌ Error deleting:`, error.message);
      }
    } else {
      console.log(`  ℹ️  Dry run - no changes made`);
    }
  }

  return { deleted };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('='.repeat(60));
  console.log('🧹 Duplicate Cleanup Utility');
  console.log('='.repeat(60));
  
  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made');
    console.log('Use --execute flag to actually perform cleanup\n');
  } else {
    console.log('\n⚠️  LIVE MODE - Changes will be made to the database!\n');
  }

  try {
    await db.testConnections();
    console.log('');

    // Find duplicates
    await findDuplicateCompanies();
    await findDuplicateJobs();

    // Merge/delete if not dry run
    const companyResults = await mergeDuplicateCompanies(dryRun);
    const jobResults = await deleteDuplicateJobs(dryRun);

    console.log('\n' + '='.repeat(60));
    console.log('📊 Cleanup Summary');
    console.log('='.repeat(60));
    console.log(`Companies merged: ${companyResults.merged}`);
    console.log(`Companies deleted: ${companyResults.deleted}`);
    console.log(`Jobs deleted: ${jobResults.deleted}`);
    console.log('='.repeat(60));

    if (dryRun) {
      console.log('\nℹ️  This was a dry run. Use --execute to apply changes.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await db.rawPool.end();
    await db.cleanPool.end();
  }
}

main();