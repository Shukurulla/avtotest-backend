const { MongoClient, ObjectId } = require("mongodb");

function idToDate(id) {
  const ts = parseInt(id.slice(0,8), 16);
  return new Date(ts * 1000).toISOString().replace("T"," ").slice(0,19);
}

const putIds = [
  "69d38c73299c0676300e6fb8",
  "69d759f029b513172944f11a",
  "69d75b4129b5131729451111",
  "69d8790e29b513172954ee01",
  "69dccbf029b513172996eaea",
  "69cb9472501faf20ae17f3d7",
  "69d09aa0299c067630f2168e",
  "69d0a073299c067630f2ab0c",
  "69d0a0b2299c067630f2b22f",
  "69d0a0ea299c067630f2ba1e",
  "69d0d9b2299c067630f92786",
  "69d2260f299c067630034039",
  "69ddd79d04198c7caf09534d",
  "69ddd83504198c7caf0971a6",
  "69d12d64299c06763000ee62",
  "69de04fc04198c7caf0f58d3",
  "69d7339529b51317293e4a46",
  "69d5d914299c0676302df249",
  "69d37cf2299c0676300c6a9d",
  "69d0d14b299c067630f8552f",
  "69ca5cba501faf20ae09aa54"
];

const deleteIds = [
  "6982d20b5adac73dd5736bbd",
  "69ccd5f2299c067630be4aea",
  "69d732dd29b51317293e325f",
  "69d751a129b513172943b143",
  "69d74d8a29b513172942d212",
  "69d38aa1299c0676300e3f12",
  "69d35ef9299c0676300a0965",
  "69ca034b501faf20aefde755",
  "69c35e8b501faf20ae9f75f9",
  "69ddd70b04198c7caf0940ba",
  "69d8bbc029b51317295af180",
  "69d892a729b513172957b6e9",
  "69dc862829b51317298dd7f9",
  "69d76af229b513172945f6ac",
  "69d61c3b299c06763035468d",
  "69d4d9ae299c06763022bfc4",
  "69d35187299c06763007f7f2",
  "69cba48c501faf20ae1a9170",
  "69cba450501faf20ae1a8a09",
  "69cba24b501faf20ae1a2f56",
  "69cb6a7a501faf20ae13c65e",
  "69ca66d3501faf20ae0b1dc8",
  "69ca506c501faf20ae080199",
  "69ca4703501faf20ae066bd9",
  "69c60af8501faf20aece53b7",
  "69c5146b501faf20aec4cc5f",
  "69c20eb4501faf20ae88cdc6",
  "69c10d7f501faf20ae7cac09",
  "69b24e9b93296095b1262843",
  "69b1045d93296095b10d07af",
  "69c0e696501faf20ae788b10",
  "69c0e0f1501faf20ae77a914",
  "69c0cec9501faf20ae75291f"
];

async function main() {
  const client = new MongoClient("mongodb://185.197.195.71:27018/avto-test");
  await client.connect();
  const db = client.db("avto-test");
  const col = db.collection("errortrackingusers");
  const atCol = db.collection("activetests");

  console.log("\n=== UPDATE (PUT) qilingan userlar ===");
  for (const id of putIds) {
    let user;
    try { user = await col.findOne({ _id: new ObjectId(id) }); } catch(e) { user = null; }
    const createdAt = idToDate(id);
    if (user) {
      const start = user.courseStartDate ? user.courseStartDate.toISOString().slice(0,10) : '-';
      const end = user.courseEndDate ? user.courseEndDate.toISOString().slice(0,10) : '-';
      console.log(`[${createdAt}] odamId:${user.odamId} | ${user.firstName} ${user.lastName} | tel:${user.phoneNumber||'-'} | narx:${user.coursePrice||'-'} so'm | kurs:${start} -> ${end} | isActive:${user.isActive}`);
    } else {
      console.log(`[${createdAt}] _id:${id} => TOPILMADI (o'chirilgan?)`);
    }
  }

  console.log("\n=== O'CHIRILGAN userlar (DELETE) ===");
  for (const id of deleteIds) {
    const createdAt = idToDate(id);
    // ActiveTest dan nomini topamiz
    const at = await atCol.findOne({ }, { sort: { _id: 1 } });
    const nameDoc = await atCol.findOne(
      { "odamFullName": { $exists: true } },
      { sort: { startedAt: -1 } }
    );
    console.log(`[${createdAt}] _id:${id}`);
  }

  // O'chirilgan userlar nomlarini ActiveTest dan topamiz
  console.log("\n=== O'chirilganlarning ActiveTest dan nomi ===");
  for (const id of deleteIds) {
    const createdAt = idToDate(id);
    // Bu user o'chirilgan, ActiveTest da adminId bo'lgan eng so'nggi yozuv bor bo'lsa
    // lekin biz adminId ni bilmaymiz shu yerdan. odamId ham yo'q.
    // Faqat tasdiqlash: bu _id lar uchun ActiveTest da test bormi?
  }

  await client.close();
}
main().catch(console.error);
