import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const ATLAS_URI = process.env.MONGODB_URI_ATLAS;
const LOCAL_URI = process.env.MONGODB_URI;

// Collections to migrate
const COLLECTIONS = ['users', 'templates', 'questions', 'testresults', 'synclogs'];

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function connectToDatabase(uri, name) {
  try {
    const conn = await mongoose.createConnection(uri).asPromise();
    log(`✓ ${name} MongoDB'ga ulandi`, 'green');
    return conn;
  } catch (error) {
    log(`✗ ${name} MongoDB'ga ulanishda xatolik: ${error.message}`, 'red');
    throw error;
  }
}

async function getCollectionStats(connection, collectionName) {
  try {
    const collection = connection.collection(collectionName);
    const count = await collection.countDocuments();
    return count;
  } catch (error) {
    return 0;
  }
}

async function migrateCollection(atlasConn, localConn, collectionName) {
  try {
    log(`\n📦 ${collectionName} kolleksiyasini ko'chirish boshlandi...`, 'cyan');

    const sourceCollection = atlasConn.collection(collectionName);
    const targetCollection = localConn.collection(collectionName);

    // Get total count
    const totalCount = await sourceCollection.countDocuments();

    if (totalCount === 0) {
      log(`  ⚠ ${collectionName} bo'sh, o'tkazib yuborildi`, 'yellow');
      return { collectionName, migrated: 0, errors: 0 };
    }

    log(`  📊 Jami ${totalCount} ta hujjat topildi`, 'blue');

    // Drop existing collection in local database
    try {
      await targetCollection.drop();
      log(`  🗑 Local'dagi eski ma'lumotlar o'chirildi`, 'yellow');
    } catch (error) {
      // Collection doesn't exist, which is fine
    }

    // Batch size for migration
    const batchSize = 1000;
    let migratedCount = 0;
    let errorCount = 0;

    // Migrate in batches
    const cursor = sourceCollection.find({}).batchSize(batchSize);
    let batch = [];

    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= batchSize) {
        try {
          await targetCollection.insertMany(batch, { ordered: false });
          migratedCount += batch.length;
          log(`  ✓ ${migratedCount}/${totalCount} hujjat ko'chirildi`, 'green');
          batch = [];
        } catch (error) {
          errorCount += batch.length;
          log(`  ✗ Batch ko'chirishda xatolik: ${error.message}`, 'red');
          batch = [];
        }
      }
    }

    // Insert remaining documents
    if (batch.length > 0) {
      try {
        await targetCollection.insertMany(batch, { ordered: false });
        migratedCount += batch.length;
        log(`  ✓ ${migratedCount}/${totalCount} hujjat ko'chirildi`, 'green');
      } catch (error) {
        errorCount += batch.length;
        log(`  ✗ Oxirgi batch ko'chirishda xatolik: ${error.message}`, 'red');
      }
    }

    // Copy indexes
    try {
      const indexes = await sourceCollection.indexes();
      for (const index of indexes) {
        // Skip _id_ index as it's created automatically
        if (index.name !== '_id_') {
          const key = index.key;
          const options = {
            name: index.name,
            unique: index.unique || false,
            sparse: index.sparse || false,
            background: true,
          };
          await targetCollection.createIndex(key, options);
        }
      }
      log(`  📑 Indexlar ko'chirildi`, 'green');
    } catch (error) {
      log(`  ⚠ Index ko'chirishda xatolik: ${error.message}`, 'yellow');
    }

    log(`  ✅ ${collectionName} kolleksiyasi muvaffaqiyatli ko'chirildi!`, 'green');
    log(`     Jami: ${totalCount}, Ko'chirildi: ${migratedCount}, Xatolar: ${errorCount}`, 'blue');

    return { collectionName, total: totalCount, migrated: migratedCount, errors: errorCount };
  } catch (error) {
    log(`  ✗ ${collectionName} ko'chirishda xatolik: ${error.message}`, 'red');
    return { collectionName, total: 0, migrated: 0, errors: 1, error: error.message };
  }
}

async function migrateData() {
  const startTime = Date.now();

  log('═══════════════════════════════════════════════════════', 'cyan');
  log('🚀 MongoDB Atlas → Local Migration Tool', 'cyan');
  log('═══════════════════════════════════════════════════════', 'cyan');

  if (!ATLAS_URI) {
    log('\n✗ MONGODB_URI_ATLAS topilmadi .env faylida!', 'red');
    process.exit(1);
  }

  if (!LOCAL_URI) {
    log('\n✗ MONGODB_URI topilmadi .env faylida!', 'red');
    process.exit(1);
  }

  log('\n📋 Atlas URI: ' + ATLAS_URI.replace(/:[^:@]+@/, ':****@'), 'blue');
  log('📋 Local URI: ' + LOCAL_URI.replace(/:[^:@]+@/, ':****@'), 'blue');

  let atlasConnection;
  let localConnection;

  try {
    // Connect to both databases
    log('\n🔌 MongoDB\'larga ulanish...', 'yellow');
    atlasConnection = await connectToDatabase(ATLAS_URI, 'Atlas');
    localConnection = await connectToDatabase(LOCAL_URI, 'Local');

    // Show statistics before migration
    log('\n📊 Atlas\'dagi ma\'lumotlar:', 'yellow');
    for (const collection of COLLECTIONS) {
      const count = await getCollectionStats(atlasConnection, collection);
      log(`   ${collection}: ${count} ta hujjat`, 'blue');
    }

    // Confirm migration
    log('\n⚠️  DIQQAT: Local MongoDB\'dagi barcha ma\'lumotlar o\'chiriladi!', 'yellow');
    log('⏳ 3 soniyadan keyin ko\'chirish boshlanadi...', 'yellow');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Migrate each collection
    log('\n🔄 Ma\'lumotlarni ko\'chirish boshlandi...', 'cyan');
    const results = [];

    for (const collection of COLLECTIONS) {
      const result = await migrateCollection(atlasConnection, localConnection, collection);
      results.push(result);
    }

    // Show summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    log('\n═══════════════════════════════════════════════════════', 'cyan');
    log('📊 MIGRATION SUMMARY', 'cyan');
    log('═══════════════════════════════════════════════════════', 'cyan');

    let totalMigrated = 0;
    let totalErrors = 0;

    for (const result of results) {
      const status = result.errors > 0 ? '⚠️' : '✅';
      log(`${status} ${result.collectionName}: ${result.migrated || 0}/${result.total || 0} hujjat`,
          result.errors > 0 ? 'yellow' : 'green');
      totalMigrated += result.migrated || 0;
      totalErrors += result.errors || 0;
    }

    log('───────────────────────────────────────────────────────', 'cyan');
    log(`Jami ko\'chirildi: ${totalMigrated} ta hujjat`, 'blue');
    log(`Xatolar: ${totalErrors}`, totalErrors > 0 ? 'yellow' : 'green');
    log(`Vaqt: ${duration} soniya`, 'blue');
    log('═══════════════════════════════════════════════════════', 'cyan');

    if (totalErrors === 0) {
      log('\n🎉 Migration muvaffaqiyatli yakunlandi!', 'green');
    } else {
      log('\n⚠️  Migration yakunlandi, lekin ba\'zi xatolar bor', 'yellow');
    }

  } catch (error) {
    log(`\n✗ Migration\'da xatolik: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    // Close connections
    if (atlasConnection) {
      await atlasConnection.close();
      log('\n🔌 Atlas connection yopildi', 'blue');
    }
    if (localConnection) {
      await localConnection.close();
      log('🔌 Local connection yopildi', 'blue');
    }
  }
}

// Run migration
migrateData()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
