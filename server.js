require('dotenv').config();

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const express  = require('express');
const mongoose = require('mongoose');
const path     = require('path');
const cors     = require('cors');
const multer   = require('multer');
const pdfParse = require('pdf-parse');
const fs       = require('fs');

if (!fs.existsSync('uploads/')) fs.mkdirSync('uploads/');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        try {
            cb(null, Date.now() + '-' + Buffer.from(file.originalname, 'binary').toString('utf8'));
        } catch {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }
});
const upload = multer({ storage });

const app  = express();
const PORT = 8080;

app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
    next();
});
app.use(express.static(__dirname));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('개인 클라우드 MongoDB Connected...');
        mongoose.connection.once('open', async () => {
            try {
                await mongoose.connection.db.collection('criterias').dropIndex('week_1');
            } catch { /* 이미 없으면 무시 */ }
        });
    })
    .catch(err => { console.error('!!! MongoDB 연결 실패 !!!', err); });

// ── Schemas ──────────────────────────────────────────────────────────────────

const UserSchema = new mongoose.Schema({
    userId:   { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name:  String,
    role:  String,
    tokens: { type: Number, default: 320 }
});

const ReportSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    groupId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    week:     Number,
    title:    String,
    content:  String,
    authorId: String,
    aiFeedback: String,
    studentReplies: [{
        name: String, content: String,
        createdAt: { type: Date, default: Date.now },
        profReplies: [{ name: String, content: String, createdAt: { type: Date, default: Date.now } }]
    }],
    isLocked: { type: Boolean, default: true }
});

const CriteriaSchema = new mongoose.Schema({
    courseId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    week:          { type: Number, required: true },
    fileName:      String,
    extractedText: String,
    updatedAt:     { type: Date, default: Date.now }
});

const CourseSchema = new mongoose.Schema({
    title:       { type: String, required: true },
    inviteCode:  { type: String, unique: true },
    professorId: { type: String, required: true },
    professorName: String,
    enrolledStudents: [{ userId: String, name: String, joinedAt: { type: Date, default: Date.now } }],
    syllabusAnalysis: {
        weekCount:  { type: Number, default: 0 },
        milestones: [{ label: String, targetWeek: Number }],
        weeklyPlan: [{ week: Number, topic: String }],
        analyzedAt: Date
    },
    createdAt: { type: Date, default: Date.now }
});

const GroupSchema = new mongoose.Schema({
    name:        { type: String, required: true },
    courseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    inviteCode:  { type: String, unique: true },
    leaderId:    String,
    leaderName:  String,
    members: [{ userId: String, name: String, joinedAt: { type: Date, default: Date.now } }],
    currentMilestoneIdx: { type: Number, default: 0 },
    milestoneStatus:     { type: String, enum: ['active', 'pending_approval', 'all_completed'], default: 'active' },
    notionLink:          String,
    notionSummary:       String,
    notionSummarizedAt:  Date,
    createdAt: { type: Date, default: Date.now }
});

const User     = mongoose.model('User',     UserSchema);
const Report   = mongoose.model('Report',   ReportSchema);
const Criteria = mongoose.model('Criteria', CriteriaSchema);
const Course   = mongoose.model('Course',   CourseSchema);
const Group    = mongoose.model('Group',    GroupSchema);

function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function reportFilter(weekNum, courseId, groupId) {
    const q = { week: weekNum };
    if (courseId) q.courseId = courseId;
    if (groupId)  q.groupId  = groupId;
    return q;
}

// ── 기본 라우트 ───────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── 회원 API ──────────────────────────────────────────────────────────────────

app.post('/api/signup', async (req, res) => {
    const { userId, password, name, role } = req.body;
    try {
        if (await User.findOne({ userId }))
            return res.status(400).json({ message: "이미 존재하는 학번/교번입니다." });
        await new User({ userId, password, name: name || "신규 가입자", role: role || "student", tokens: role === 'prof' ? 0 : 320 }).save();
        res.json({ message: "회원가입이 완료되었습니다! 로그인해 주세요." });
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/login', async (req, res) => {
    const { userId, password, role } = req.body;
    try {
        const user = await User.findOne({ userId });
        if (!user)               return res.status(401).json({ message: "존재하지 않는 학번 또는 교번입니다." });
        if (user.password !== password) return res.status(401).json({ message: "비밀번호가 일치하지 않습니다." });
        if (user.role !== role)  return res.status(403).json({ message: "선택하신 회원 유형(학생/교수)이 일치하지 않습니다." });
        res.json(user);
    } catch (err) { res.status(500).send(err.message); }
});

app.patch('/api/users/:userId/tokens', async (req, res) => {
    try {
        const user = await User.findOneAndUpdate({ userId: req.params.userId }, { tokens: req.body.tokens }, { new: true, upsert: true });
        res.json(user);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/api/users/mvp', async (req, res) => {
    try { res.json(await User.findOne().sort({ tokens: -1 }) || { name: '없음', tokens: 0 }); }
    catch (err) { res.status(500).send(err.message); }
});

app.get('/api/users/total-tokens', async (req, res) => {
    try {
        const result = await User.aggregate([{ $group: { _id: null, total: { $sum: "$tokens" } } }]);
        res.json({ totalTokens: result.length > 0 ? result[0].total : 0 });
    } catch (err) { res.status(500).send(err.message); }
});

// ── 과목 API ──────────────────────────────────────────────────────────────────

app.post('/api/courses', async (req, res) => {
    const { title, professorId, professorName } = req.body;
    if (!title || !professorId) return res.status(400).json({ message: "과목명과 교수자 정보가 필요합니다." });
    try {
        let inviteCode, exists = true;
        while (exists) { inviteCode = generateInviteCode(); exists = await Course.findOne({ inviteCode }); }
        res.json(await new Course({ title, inviteCode, professorId, professorName }).save());
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/courses/join', async (req, res) => {
    const { inviteCode, userId, name } = req.body;
    if (!inviteCode || !userId) return res.status(400).json({ message: "초대 코드와 학번이 필요합니다." });
    try {
        const course = await Course.findOne({ inviteCode: inviteCode.toUpperCase() });
        if (!course) return res.status(404).json({ message: "유효하지 않은 초대 코드입니다." });
        if (course.enrolledStudents.some(s => s.userId === userId))
            return res.status(400).json({ message: "이미 참여 중인 과목입니다." });
        course.enrolledStudents.push({ userId, name });
        await course.save();
        res.json(course);
    } catch (err) { res.status(500).send(err.message); }
});

app.get('/api/courses/by-user/:userId', async (req, res) => {
    const { userId } = req.params;
    const { role } = req.query;
    try {
        const courses = role === 'prof'
            ? await Course.find({ professorId: userId }).sort({ createdAt: -1 })
            : await Course.find({ 'enrolledStudents.userId': userId }).sort({ createdAt: -1 });
        res.json(courses);
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/courses/:courseId', async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });
        res.json({ message: "과목이 삭제되었습니다." });
    } catch (err) { res.status(500).send(err.message); }
});

// 단일 과목 조회
app.get('/api/courses/:courseId', async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });
        res.json(course);
    } catch (err) { res.status(500).send(err.message); }
});

// 강의 계획서 AI 분석 공통 헬퍼
const SYLLABUS_SYSTEM_PROMPT = `강의 계획서를 분석하여 반드시 아래 JSON 형식으로만 반환하세요:
{
  "weekCount": 전체 주차 수 (정수),
  "milestones": [
    { "label": "마일스톤 이름", "targetWeek": 목표 주차 }
  ],
  "weeklyPlan": [
    { "week": 주차 번호, "topic": "주차별 주요 내용 (20자 이내)" }
  ]
}
milestones는 프로젝트 주요 단계 3~6개를 추출하세요. 없으면 일반적인 단계(기획→설계→구현→테스트→발표)로 생성하세요.`;

async function runSyllabusAI(text) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYLLABUS_SYSTEM_PROMPT },
            { role: "user",   content: `강의 계획서:\n${text.slice(0, 6000)}` }
        ]
    });
    return JSON.parse(completion.choices[0].message.content);
}

async function saveSyllabusToCourse(course, analysis) {
    course.syllabusAnalysis = {
        weekCount:  Number(analysis.weekCount)  || 15,
        milestones: Array.isArray(analysis.milestones) ? analysis.milestones : [],
        weeklyPlan: Array.isArray(analysis.weeklyPlan) ? analysis.weeklyPlan : [],
        analyzedAt: new Date()
    };
    await course.save();
    return course;
}

// 강의 계획서 파일 업로드 + AI 분석
app.post('/api/courses/:courseId/syllabus', upload.single('file'), async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });
        if (!req.file)  return res.status(400).json({ message: "업로드된 파일이 없습니다." });

        let extractedText = "";
        try {
            if (req.file.mimetype === 'application/pdf') {
                extractedText = (await pdfParse(fs.readFileSync(req.file.path))).text;
            } else {
                extractedText = fs.readFileSync(req.file.path, 'utf8');
            }
        } catch (parseErr) {
            return res.status(400).json({ message: `파일 읽기 실패: ${parseErr.message}` });
        } finally {
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        }

        if (!extractedText.trim()) {
            return res.status(400).json({
                message: "이 PDF는 이미지 스캔본이라 텍스트를 추출할 수 없습니다.",
                hint: "직접 입력 탭을 이용해 강의 계획서 내용을 붙여넣어 주세요."
            });
        }

        const analysis = await runSyllabusAI(extractedText);
        const updatedCourse = await saveSyllabusToCourse(course, analysis);
        res.json({ message: "강의 계획서 분석이 완료되었습니다.", course: updatedCourse });

    } catch (err) {
        console.error('[Syllabus File] Error:', err.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const status = err.status === 401 ? 503 : 500;
        const msg = err.status === 401
            ? "OpenAI API 키가 유효하지 않습니다."
            : `서버 오류: ${err.message}`;
        res.status(status).json({ message: msg });
    }
});

// 강의 계획서 직접 입력 + AI 분석
app.post('/api/courses/:courseId/syllabus-text', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ message: "분석할 텍스트가 없습니다." });

        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ message: "과목을 찾을 수 없습니다." });

        const analysis = await runSyllabusAI(text);
        const updatedCourse = await saveSyllabusToCourse(course, analysis);
        res.json({ message: "강의 계획서 분석이 완료되었습니다.", course: updatedCourse });

    } catch (err) {
        console.error('[Syllabus Text] Error:', err.message);
        const status = err.status === 401 ? 503 : 500;
        const msg = err.status === 401
            ? "OpenAI API 키가 유효하지 않습니다."
            : `서버 오류: ${err.message}`;
        res.status(status).json({ message: msg });
    }
});

// ── 조 API ────────────────────────────────────────────────────────────────────

// 조 생성 (학생)
app.post('/api/groups', async (req, res) => {
    const { name, courseId, leaderId, leaderName } = req.body;
    if (!name || !courseId || !leaderId) return res.status(400).json({ message: "조 이름, 과목 ID, 학번이 필요합니다." });
    try {
        let inviteCode, exists = true;
        while (exists) { inviteCode = generateInviteCode(); exists = await Group.findOne({ inviteCode }); }
        const group = await new Group({ name, courseId, inviteCode, leaderId, leaderName, members: [{ userId: leaderId, name: leaderName }] }).save();
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 조 참여 (학생 — 초대 코드)
app.post('/api/groups/join', async (req, res) => {
    const { inviteCode, userId, name } = req.body;
    if (!inviteCode || !userId) return res.status(400).json({ message: "초대 코드와 학번이 필요합니다." });
    try {
        const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
        if (!group) return res.status(404).json({ message: "유효하지 않은 초대 코드입니다." });
        if (group.members.some(m => m.userId === userId))
            return res.status(400).json({ message: "이미 참여 중인 조입니다." });
        group.members.push({ userId, name });
        await group.save();
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 과목별 조 목록 조회
app.get('/api/groups/by-course/:courseId', async (req, res) => {
    try {
        res.json(await Group.find({ courseId: req.params.courseId }).sort({ createdAt: 1 }));
    } catch (err) { res.status(500).send(err.message); }
});

// 사용자의 조 조회 (과목별)
app.get('/api/groups/my/:userId', async (req, res) => {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ message: "courseId가 필요합니다." });
    try {
        res.json(await Group.findOne({ courseId, 'members.userId': req.params.userId }) || null);
    } catch (err) { res.status(500).send(err.message); }
});

// 마일스톤 완료 요청 (학생)
app.post('/api/groups/:groupId/milestone-request', async (req, res) => {
    try {
        const group = await Group.findByIdAndUpdate(
            req.params.groupId,
            { milestoneStatus: 'pending_approval' },
            { new: true }
        );
        if (!group) return res.status(404).json({ message: "조를 찾을 수 없습니다." });
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 마일스톤 승인 (교수)
app.patch('/api/groups/:groupId/milestone-approve', async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ message: "조를 찾을 수 없습니다." });
        const course = await Course.findById(group.courseId);
        const milestoneCount = course?.syllabusAnalysis?.milestones?.length || 5;
        const nextIdx = group.currentMilestoneIdx + 1;
        group.currentMilestoneIdx = nextIdx;
        group.milestoneStatus = nextIdx >= milestoneCount ? 'all_completed' : 'active';
        await group.save();
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// 마일스톤 반려 (교수)
app.patch('/api/groups/:groupId/milestone-reject', async (req, res) => {
    try {
        const group = await Group.findByIdAndUpdate(
            req.params.groupId,
            { milestoneStatus: 'active' },
            { new: true }
        );
        if (!group) return res.status(404).json({ message: "조를 찾을 수 없습니다." });
        res.json(group);
    } catch (err) { res.status(500).send(err.message); }
});

// ── 노션 페이지 API ───────────────────────────────────────────────────────────

// Notion 페이지 ID 추출 (URL에서 32자 hex 추출)
function extractNotionPageId(url) {
    const clean = url.split('?')[0];
    const match = clean.match(/([a-f0-9]{32})$/i)
                || clean.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
    if (!match) return null;
    return match[1].replace(/-/g, '');
}

// 32자 hex → UUID 포맷 (8-4-4-4-12)
function toUUID(hex) {
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// 공식 Notion API — 블록 텍스트 변환
function extractBlockText(block) {
    const type = block.type;
    const content = block[type];
    if (!content) return '';
    const text = (content.rich_text || []).map(t => t.plain_text).join('').trim();
    if (!text && type !== 'divider') return '';
    switch (type) {
        case 'heading_1':           return `# ${text}`;
        case 'heading_2':           return `## ${text}`;
        case 'heading_3':           return `### ${text}`;
        case 'bulleted_list_item':  return `• ${text}`;
        case 'numbered_list_item':  return `1. ${text}`;
        case 'to_do':               return `${content.checked ? '☑' : '☐'} ${text}`;
        case 'quote':               return `> ${text}`;
        case 'callout':             return `📌 ${text}`;
        case 'toggle':              return `▶ ${text}`;
        case 'code':                return `[코드] ${text}`;
        case 'divider':             return '---';
        default:                    return text;
    }
}

// 공식 Notion API — 블록 목록 재귀 조회 (최대 depth 3)
async function fetchNotionBlocks(blockId, notionKey, depth = 0) {
    if (depth > 3) return [];
    const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`, {
        headers: { 'Authorization': `Bearer ${notionKey}`, 'Notion-Version': '2022-06-28' },
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`Notion API ${res.status}`);
    const data = await res.json();
    const lines = [];
    for (const block of data.results) {
        const text = extractBlockText(block);
        if (text) lines.push(text);
        if (block.has_children) {
            const children = await fetchNotionBlocks(block.id, notionKey, depth + 1);
            lines.push(...children.map(l => '  ' + l));
        }
    }
    return lines;
}

// 노션 페이지 등록 + AI 정리
app.post('/api/groups/:groupId/notion', async (req, res) => {
    const { notionUrl } = req.body;
    if (!notionUrl) return res.status(400).json({ message: 'Notion URL이 필요합니다.' });

    const notionKey = process.env.NOTION_API_KEY;
    if (!notionKey) {
        return res.status(500).json({ message: 'NOTION_API_KEY가 서버에 설정되지 않았습니다. .env 파일을 확인해주세요.' });
    }

    const rawId = extractNotionPageId(notionUrl);
    if (!rawId) {
        return res.status(400).json({ message: 'URL에서 Notion 페이지 ID를 찾을 수 없습니다. 링크를 다시 확인해주세요.' });
    }
    const pageUUID = toUUID(rawId);

    try {
        // 페이지 제목 가져오기
        const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageUUID}`, {
            headers: { 'Authorization': `Bearer ${notionKey}`, 'Notion-Version': '2022-06-28' },
            signal: AbortSignal.timeout(10000)
        });

        if (!pageRes.ok) {
            if (pageRes.status === 404)
                return res.status(400).json({ message: '페이지를 찾을 수 없습니다. Notion 페이지에 인테그레이션(연결)을 추가했는지 확인해주세요.' });
            if (pageRes.status === 401 || pageRes.status === 403)
                return res.status(400).json({ message: 'Notion API 인증 오류입니다. NOTION_API_KEY와 페이지 연결을 확인해주세요.' });
            return res.status(400).json({ message: `Notion 페이지를 불러오지 못했습니다 (${pageRes.status}).` });
        }

        const pageData = await pageRes.json();
        const titleArr = pageData.properties?.title?.title || pageData.properties?.Name?.title || [];
        const pageTitle = titleArr.map(t => t.plain_text).join('') || '(제목 없음)';

        // 블록 내용 가져오기
        const blockLines = await fetchNotionBlocks(pageUUID, notionKey);
        const extractedText = [`# ${pageTitle}`, ...blockLines].join('\n');

        if (!extractedText.trim()) {
            return res.status(400).json({ message: '페이지에서 텍스트 내용을 찾지 못했습니다. 페이지에 내용이 있는지 확인해주세요.' });
        }

        // AI 정리
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Notion 페이지의 내용을 빠짐없이 읽기 좋게 정리해주는 어시스턴트입니다. 헤더·목록·체크리스트 등 원본 구조를 유지하면서 깔끔하게 정리해주세요. 내용을 임의로 축약하거나 생략하지 마세요.'
                },
                {
                    role: 'user',
                    content: `다음 Notion 페이지 내용을 정리해주세요:\n\n${extractedText.slice(0, 6000)}`
                }
            ],
            max_tokens: 2000,
            temperature: 0.3
        });

        const summary = completion.choices[0].message.content;
        const group = await Group.findByIdAndUpdate(
            req.params.groupId,
            { notionLink: notionUrl, notionSummary: summary, notionSummarizedAt: new Date() },
            { new: true }
        );
        if (!group) return res.status(404).json({ message: '조를 찾을 수 없습니다.' });
        res.json(group);

    } catch (err) {
        console.error('[Notion] Error:', err.message);
        if (err.name === 'TimeoutError')
            return res.status(408).json({ message: '페이지 로딩 시간이 초과됐습니다.' });
        res.status(500).json({ message: `서버 오류: ${err.message}` });
    }
});

// ── 파일 업로드 API ───────────────────────────────────────────────────────────

app.get('/api/upload-criteria', async (req, res) => {
    try {
        const query = {};
        if (req.query.courseId) query.courseId = req.query.courseId;
        res.json(await Criteria.find(query).sort({ week: 1 }));
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/api/upload-criteria/:id', async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).send("유효하지 않은 자료 ID 형식입니다.");
    try {
        const deleted = await Criteria.findByIdAndDelete(id);
        if (!deleted) return res.status(404).send("삭제할 자료를 찾을 수 없습니다.");
        res.json({ message: "자료가 성공적으로 삭제되었습니다." });
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/api/upload-criteria/:week', upload.single('file'), async (req, res) => {
    try {
        const weekNum = parseInt(req.params.week);
        if (!req.file) return res.status(400).send("업로드된 파일이 없습니다.");

        let safeFileName = req.file.originalname;
        try { safeFileName = Buffer.from(req.file.originalname, 'binary').toString('utf8'); } catch {}

        let extractedText = "";
        if (req.file.mimetype === 'application/pdf') {
            try { extractedText = (await pdfParse(fs.readFileSync(req.file.path))).text; }
            catch { throw new Error("PDF 파일 분석에 실패했습니다."); }
        } else if (req.file.mimetype.includes('spreadsheet') || req.file.originalname.endsWith('.xlsx')) {
            extractedText = `[엑셀 파일: ${safeFileName}] 채점 루브릭 기준으로 사용됩니다.`;
        } else {
            extractedText = fs.readFileSync(req.file.path, 'utf8');
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        const { courseId } = req.body;
        const criteriaData = { week: weekNum, fileName: safeFileName, extractedText, updatedAt: new Date() };
        if (courseId) criteriaData.courseId = courseId;
        const criteria = await new Criteria(criteriaData).save();
        res.json({ message: "성공적으로 파일을 학습했습니다.", criteria });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send(err.message);
    }
});

// ── 보고서 API ────────────────────────────────────────────────────────────────

// 전체 분석 요약 — :week 보다 먼저 등록
app.get('/api/reports/overall-summary', async (req, res) => {
    const { courseId, groupId } = req.query;
    try {
        const query = {};
        if (courseId) query.courseId = courseId;
        if (groupId)  query.groupId  = groupId;
        const reports = await Report.find(query).sort({ week: 1 });
        if (reports.length === 0)
            return res.json({ summary: "아직 제출된 보고서가 없어 분석을 진행할 수 없습니다." });

        const reportsContext = reports.map(r =>
            `[${r.week}주차] 제목: ${r.title}\n내용: ${r.content}\nAI피드백: ${r.aiFeedback || '없음'}`
        ).join("\n\n---\n\n");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `당신은 교수님을 보좌하는 교육 분석 전문가입니다. 학생들의 주차별 보고서와 AI 피드백 내역을 분석하여 현재 학습 진행 상황을 5줄 이내로 전문적으로 요약해 주세요.` },
                { role: "user",   content: `현재까지의 보고서 내역입니다:\n\n${reportsContext}` }
            ],
        });
        res.json({ summary: completion.choices[0].message.content });
    } catch (err) { res.status(500).send(err.message); }
});

// 특정 주차 보고서 조회
app.get('/api/reports/:week', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    const { courseId, groupId } = req.query;
    try {
        const report = await Report.findOne(reportFilter(weekNum, courseId, groupId));
        if (!report) return res.status(404).json({ message: "해당 주차의 보고서가 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// AI 피드백 재생성 (교수용)
app.patch('/api/reports/:week/ai-feedback', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { courseId, groupId } = req.body;
    try {
        const filter = reportFilter(weekNum, courseId, groupId);
        const report = await Report.findOne(filter);
        if (!report || !report.content) return res.status(404).send("분석할 학생 보고서가 없습니다.");

        const criteriaQuery = { week: weekNum };
        if (courseId) criteriaQuery.courseId = courseId;
        const allCriteria = await Criteria.find(criteriaQuery);
        const professorRubric = allCriteria.length > 0
            ? allCriteria.map(c => `[파일명: ${c.fileName}]\n${c.extractedText}`).join("\n\n---\n\n")
            : "제공된 루브릭 없음. 일반적인 대학 과제 기준으로 평가하세요.";

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `대학 교수님의 평가 기조를 대변하는 AI 튜터입니다. 아래 채점 루브릭을 기반으로 학생 보고서를 3줄 내외로 평가해 주세요.\n\n[루브릭]:\n${professorRubric}` },
                { role: "user",   content: `제목: ${report.title}\n내용: ${report.content}` }
            ],
        });

        const updatedReport = await Report.findOneAndUpdate(filter, { aiFeedback: completion.choices[0].message.content }, { new: true });
        res.json(updatedReport);
    } catch (err) { res.status(500).send(err.message); }
});

// 보고서 제출 + AI 피드백 자동 생성
app.post('/api/reports/submit', async (req, res) => {
    const { week, title, content, authorId, courseId, groupId } = req.body;
    try {
        const criteriaQuery = { week: parseInt(week) };
        if (courseId) criteriaQuery.courseId = courseId;
        const allCriteria = await Criteria.find(criteriaQuery);
        const criteriaText = allCriteria.length > 0
            ? allCriteria.map(c => `[파일명: ${c.fileName}]\n${c.extractedText}`).join("\n\n---\n\n")
            : "제공된 교수자 평가 기준 없음. 일반적인 대학 프로젝트 기준에서 피드백해 주세요.";

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `대학 강의 전담 AI 튜터입니다. 교수님 평가 기준 기반으로 학생 결과물을 분석하여 2~3문장 이내로 건설적인 피드백을 작성해 주세요.` },
                { role: "user",   content: `[평가 기준]:\n${criteriaText}\n\n[제출물]:\n주차: ${week}주차\n제목: ${title}\n내용: ${content}` }
            ],
            temperature: 0.7, max_tokens: 500
        });

        const filter = reportFilter(parseInt(week), courseId, groupId);
        const updatedReport = await Report.findOneAndUpdate(
            filter,
            { title, content, authorId, aiFeedback: response.choices[0].message.content, courseId, groupId },
            { upsert: true, new: true }
        );
        res.status(200).json({ success: true, message: "보고서가 제출되었으며 AI 피드백이 생성되었습니다.", report: updatedReport });
    } catch (err) {
        res.status(500).json({ success: false, error: "AI 피드백 생성 중 오류가 발생했습니다." });
    }
});

// 학생 코멘트 등록
app.patch('/api/reports/:week/reply', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { reply, name, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const report = await Report.findOneAndUpdate(
            reportFilter(weekNum, courseId, groupId),
            { $push: { studentReplies: { name: name || '학생', content: reply } } },
            { new: true }
        );
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 학생 코멘트 수정
app.patch('/api/reports/:week/reply/:replyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId } = req.params;
    const { content, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const filter = { ...reportFilter(weekNum, courseId, groupId), 'studentReplies._id': replyId };
        const report = await Report.findOneAndUpdate(filter, { $set: { 'studentReplies.$.content': content } }, { new: true });
        if (!report) return res.status(404).json({ message: "코멘트를 찾을 수 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 학생 코멘트 삭제
app.delete('/api/reports/:week/reply/:replyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId } = req.params;
    const { courseId, groupId } = req.query;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const report = await Report.findOneAndUpdate(
            reportFilter(weekNum, courseId, groupId),
            { $pull: { studentReplies: { _id: replyId } } },
            { new: true }
        );
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 교수 답글 등록 (특정 코멘트)
app.post('/api/reports/:week/reply/:replyId/prof-reply', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId } = req.params;
    const { content, name, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const filter = { ...reportFilter(weekNum, courseId, groupId), 'studentReplies._id': replyId };
        const report = await Report.findOneAndUpdate(
            filter,
            { $push: { 'studentReplies.$.profReplies': { name: name || '교수자', content } } },
            { new: true }
        );
        if (!report) return res.status(404).json({ message: "코멘트를 찾을 수 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 교수 답글 수정
app.patch('/api/reports/:week/reply/:replyId/prof-reply/:profReplyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId, profReplyId } = req.params;
    const { content, courseId, groupId } = req.body;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const report = await Report.findOneAndUpdate(
            reportFilter(weekNum, courseId, groupId),
            { $set: { 'studentReplies.$[sr].profReplies.$[pr].content': content } },
            {
                arrayFilters: [{ 'sr._id': new mongoose.Types.ObjectId(replyId) }, { 'pr._id': new mongoose.Types.ObjectId(profReplyId) }],
                new: true
            }
        );
        if (!report) return res.status(404).json({ message: "답글을 찾을 수 없습니다." });
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

// 교수 답글 삭제
app.delete('/api/reports/:week/reply/:replyId/prof-reply/:profReplyId', async (req, res) => {
    const weekNum = parseInt(req.params.week);
    const { replyId, profReplyId } = req.params;
    const { courseId, groupId } = req.query;
    if (isNaN(weekNum)) return res.status(400).json({ message: "유효하지 않은 주차 번호입니다." });
    try {
        const filter = { ...reportFilter(weekNum, courseId, groupId), 'studentReplies._id': replyId };
        const report = await Report.findOneAndUpdate(
            filter,
            { $pull: { 'studentReplies.$.profReplies': { _id: profReplyId } } },
            { new: true }
        );
        res.json(report);
    } catch (err) { res.status(500).send(err.message); }
});

app.listen(PORT, () => console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`));
