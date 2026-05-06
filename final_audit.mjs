import { MongoClient } from "mongodb";

const client = new MongoClient("mongodb://root:SuperStrongPassword123@127.0.0.1:27017/avto-test?authSource=admin");
await client.connect();
const db = client.db("avto-test");

// Get intensive_admin id
const admin = await db.collection("admins").findOne({ username: "intensive_admin" });
const adminId = admin._id;

// Current students
const current = await db.collection("errortrackingusers").find({ createdBy: adminId }).toArray();

// All activetests for name detection
const allTests = await db.collection("activetests").find({ adminId: adminId }).sort({ startedAt: -1 }).toArray();

// Build name map from activetests
const nameFromTests = new Map();
for (const t of allTests) {
  if (!nameFromTests.has(t.odamId)) {
    nameFromTests.set(t.odamId, t.odamFullName);
  }
}

// Name changes
const nameChanges = [];
for (const u of current) {
  const currentName = (u.firstName + " " + u.lastName).trim();
  const testName = nameFromTests.get(u.odamId);
  if (testName && testName !== "Test Test" && testName.toLowerCase() !== currentName.toLowerCase() && testName.trim() !== "") {
    nameChanges.push({
      odamId: u.odamId,
      oldName: testName,
      newName: currentName,
      phone: u.phoneNumber || "-",
      courseStart: u.courseStartDate ? new Date(u.courseStartDate).toISOString().slice(0,10) : "-",
      courseEnd: u.courseEndDate ? new Date(u.courseEndDate).toISOString().slice(0,10) : "-",
      coursePrice: u.coursePrice || null
    });
  }
}

// Course end date changes (from old backup restored collection)
const oldUsers = await db.collection("et_old_server").find({}).toArray();
const oldMap = new Map(oldUsers.map(u => [u.odamId, u]));

const endDateChanges = [];
for (const u of current) {
  const old = oldMap.get(u.odamId);
  if (!old) continue;
  const oldEnd = old.courseEndDate ? new Date(old.courseEndDate).toISOString().slice(0,10) : null;
  const newEnd = u.courseEndDate ? new Date(u.courseEndDate).toISOString().slice(0,10) : null;
  if (oldEnd && newEnd && oldEnd !== newEnd) {
    const diffMs = new Date(newEnd) - new Date(oldEnd);
    const diffDays = Math.round(diffMs / (1000*60*60*24));
    const oldStart = old.courseStartDate ? new Date(old.courseStartDate).toISOString().slice(0,10) : "-";
    const newStart = u.courseStartDate ? new Date(u.courseStartDate).toISOString().slice(0,10) : "-";
    endDateChanges.push({
      odamId: u.odamId,
      name: (u.firstName + " " + u.lastName).trim(),
      phone: u.phoneNumber || "-",
      oldStart,
      newStart,
      oldEnd,
      newEnd,
      diffDays,
      coursePrice: u.coursePrice || null
    });
  }
}

// Deleted students
const currentIds = new Set(current.map(u => u.odamId));
const deleted = [];
for (const old of oldUsers) {
  if (!currentIds.has(old.odamId)) {
    deleted.push({
      odamId: old.odamId,
      name: (old.firstName + " " + old.lastName).trim(),
      phone: old.phoneNumber || "-",
      courseStart: old.courseStartDate ? new Date(old.courseStartDate).toISOString().slice(0,10) : "-",
      courseEnd: old.courseEndDate ? new Date(old.courseEndDate).toISOString().slice(0,10) : "-",
      coursePrice: old.coursePrice || null
    });
  }
}

// Newly added after Apr 14
const oldIds = new Set(oldUsers.map(u => u.odamId));
const newlyAdded = [];
for (const u of current) {
  if (!oldIds.has(u.odamId)) {
    newlyAdded.push({
      odamId: u.odamId,
      name: (u.firstName + " " + u.lastName).trim(),
      phone: u.phoneNumber || "-",
      courseStart: u.courseStartDate ? new Date(u.courseStartDate).toISOString().slice(0,10) : "-",
      courseEnd: u.courseEndDate ? new Date(u.courseEndDate).toISOString().slice(0,10) : "-",
      coursePrice: u.coursePrice || null
    });
  }
}

// Also get first test dates for name-changed users
const firstTests = new Map();
for (const u of current) {
  const tests = allTests.filter(t => t.odamId === u.odamId).sort((a,b)=>new Date(a.startedAt)-new Date(b.startedAt));
  if (tests.length > 0) {
    firstTests.set(u.odamId, new Date(tests[tests.length-1].startedAt).toISOString().slice(0,10));
  }
}

console.log(JSON.stringify({ nameChanges, endDateChanges, deleted, newlyAdded, firstTests: Object.fromEntries(firstTests) }, null, 2));

await client.close();
