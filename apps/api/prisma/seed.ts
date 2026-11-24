import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'

const prisma = new PrismaClient()

const studentNames = [
  '陈雨桐', '李泽宇', '周思涵', '吴一凡', '郑皓文', '刘欣怡', '张梓豪', '黄雅琪',
  '徐子墨', '马嘉树', '林清越', '赵可欣', '孙浩然', '唐诗涵', '朱明轩', '何雨萱',
  '高子航', '罗晨曦', '许博文', '邓语嫣', '冯俊杰', '曾梦琪', '彭宇航', '蒋思远',
  '谢佳宁', '韩一诺', '曹雨辰', '田子涵', '董书瑶', '袁梓萱', '潘奕辰', '于安琪',
  '程浩宇', '陆欣然', '叶嘉怡', '苏子豪', '魏语彤', '吕承泽', '沈可心', '姚博涛',
  '卢诗琪', '姜宇航',
]

// 湖南初中（八年级）常见科目与卷面满分：语文/数学/英语 120，其余文化科目 100。
// 满分仍可在每场考试中单独调整，这里只作为新增考试时的默认值。
const subjectSeed = [
  { code: 'chinese', name: '语文', fullScore: 120, sortOrder: 1 },
  { code: 'math', name: '数学', fullScore: 120, sortOrder: 2 },
  { code: 'english', name: '英语', fullScore: 120, sortOrder: 3 },
  { code: 'physics', name: '物理', fullScore: 100, sortOrder: 4 },
  { code: 'politics', name: '道德与法治', fullScore: 100, sortOrder: 5 },
  { code: 'history', name: '历史', fullScore: 100, sortOrder: 6 },
  { code: 'biology', name: '生物', fullScore: 100, sortOrder: 7 },
  { code: 'geography', name: '地理', fullScore: 100, sortOrder: 8 },
]

const examSeed = [
  { name: '第一次月考', type: 'monthly' as const, heldAt: '2026-09-25' },
  { name: '第二次月考', type: 'monthly' as const, heldAt: '2026-10-30' },
  { name: '期中考试', type: 'midterm' as const, heldAt: '2026-11-15' },
]

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return (value - Math.floor(value) - 0.5) * 0.08
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

async function main() {
  // SQLite 不支持 TRUNCATE ... CASCADE，按外键依赖顺序逐表清空。
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.scoreChangeLog.deleteMany(),
    prisma.score.deleteMany(),
    prisma.importBatch.deleteMany(),
    prisma.examSubject.deleteMany(),
    prisma.exam.deleteMany(),
    prisma.teachingAssignment.deleteMany(),
    prisma.gradeDirector.deleteMany(),
    prisma.studentTermEnrollment.deleteMany(),
    prisma.student.deleteMany(),
    prisma.class.deleteMany(),
    prisma.classGroup.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.academicTerm.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.user.deleteMany(),
    prisma.appSetting.deleteMany(),
    prisma.session.deleteMany(),
  ])

  const [adminHash, directorHash, wangHash, zhangHash] = await Promise.all([
    hash('admin123'),
    hash('director123'),
    hash('wang123'),
    hash('zhang123'),
  ])

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: adminHash,
      displayName: '系统管理员',
      roles: { create: [{ role: 'admin' }] },
    },
  })
  const director = await prisma.user.create({
    data: {
      username: 'director',
      passwordHash: directorHash,
      displayName: '李主任',
      roles: { create: [{ role: 'grade_director' }] },
    },
  })
  const wang = await prisma.user.create({
    data: {
      username: 'wang',
      passwordHash: wangHash,
      displayName: '王老师',
      roles: { create: [{ role: 'head_teacher' }] },
    },
  })
  const zhang = await prisma.user.create({
    data: {
      username: 'zhang',
      passwordHash: zhangHash,
      displayName: '张老师',
      roles: { create: [{ role: 'subject_teacher' }] },
    },
  })

  const term = await prisma.academicTerm.create({
    data: {
      schoolYear: '2026-2027',
      termNo: 1,
      name: '2026-2027 学年第一学期',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-01-30'),
      isCurrent: true,
    },
  })

  const grade = await prisma.grade.create({
    data: {
      termId: term.id,
      entryYear: 2025,
      level: 8,
      name: '初二',
    },
  })

  const classGroups = await Promise.all(
    [1, 2, 3].map((number) =>
      prisma.classGroup.create({
        data: {
          entryYear: 2025,
          name: `2025级${number}班`,
          sortOrder: number,
        },
      }),
    ),
  )

  const classes = await Promise.all(
    [1, 2, 3].map((number) =>
      prisma.class.create({
        data: {
          gradeId: grade.id,
          classGroupId: classGroups[number - 1].id,
          name: `初二（${number}）班`,
          headTeacherId: number === 1 ? wang.id : undefined,
          sortOrder: number,
        },
      }),
    ),
  )

  await prisma.gradeDirector.create({
    data: { gradeId: grade.id, userId: director.id },
  })

  const subjects = await Promise.all(
    subjectSeed.map((subject) =>
      prisma.subject.create({
        data: {
          code: subject.code,
          name: subject.name,
          defaultFullScore: subject.fullScore,
          sortOrder: subject.sortOrder,
        },
      }),
    ),
  )

  const students: Array<{
    id: string
    studentNo: string
    name: string
    classId: string
    classIndex: number
    studentIndex: number
  }> = []

  for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
    for (let row = 0; row < 14; row += 1) {
      const globalIndex = classIndex * 14 + row
      const studentNo = `2025${String(globalIndex + 1).padStart(4, '0')}`
      const student = await prisma.student.create({
        data: {
          studentNo,
          name: studentNames[globalIndex] ?? `学生${globalIndex + 1}`,
        },
      })
      await prisma.studentTermEnrollment.create({
        data: {
          termId: term.id,
          studentId: student.id,
          classId: classes[classIndex].id,
        },
      })
      students.push({
        id: student.id,
        studentNo,
        name: student.name,
        classId: classes[classIndex].id,
        classIndex,
        studentIndex: row,
      })
    }
  }

  await prisma.teachingAssignment.createMany({
    data: [
      { termId: term.id, userId: zhang.id, classId: classes[0].id, subjectId: subjects[1].id },
      { termId: term.id, userId: zhang.id, classId: classes[1].id, subjectId: subjects[1].id },
    ],
  })

  await prisma.appSetting.createMany({
    data: [
      { key: 'pass_ratio', valueJson: 0.6 },
      { key: 'excellent_ratio', valueJson: 0.8 },
      { key: 'ai_enabled', valueJson: false },
    ],
  })

  const exams = []
  for (const [examIndex, item] of examSeed.entries()) {
    const exam = await prisma.exam.create({
      data: {
        termId: term.id,
        gradeId: grade.id,
        name: item.name,
        type: item.type,
        heldAt: new Date(`${item.heldAt}T00:00:00.000Z`),
        createdById: wang.id,
        examSubjects: {
          create: subjects.map((subject, index) => ({
            subjectId: subject.id,
            fullScore: subjectSeed[index].fullScore,
            includedInTotal: true,
            sortOrder: index + 1,
          })),
        },
      },
    })
    exams.push(exam)
  }

  const absenceSet = new Set(['2:5:4', '1:20:3', '0:28:1'])
  const subjectOffsets = [0.02, 0.04, 0.01, -0.01, -0.03, 0.005, -0.02, 0.015]
  const examOffsets = [0, 0.012, 0.025]
  const scoreRows: Array<{
    examId: string
    studentId: string
    subjectId: string
    classId: string
    score: number | null
    isAbsent: boolean
  }> = []

  for (const [examIndex, exam] of exams.entries()) {
    for (const student of students) {
      const ability =
        0.62 + (student.studentIndex % 14) * 0.015 + student.classIndex * 0.01
      for (const [subjectIndex, subject] of subjectSeed.entries()) {
        const key = `${examIndex}:${student.studentIndex + student.classIndex * 14}:${subjectIndex}`
        const absent = absenceSet.has(key)
        const value = absent
          ? null
          : Math.round(
              clamp(
                ability +
                  subjectOffsets[subjectIndex] +
                  examOffsets[examIndex] +
                  noise(student.studentIndex * 31 + subjectIndex * 7 + examIndex * 101),
                0.35,
                0.98,
              ) *
                subject.fullScore *
                10,
            ) / 10
        scoreRows.push({
          examId: exam.id,
          studentId: student.id,
          subjectId: subjects[subjectIndex].id,
          classId: student.classId,
          score: value,
          isAbsent: absent,
        })
      }
    }
  }

  await prisma.score.createMany({ data: scoreRows })

  await prisma.importBatch.create({
    data: {
      examId: exams[2].id,
      classId: classes[0].id,
      status: 'committed',
      fileName: '初二1班_期中考试_示例成绩.xlsx',
      filePath: 'seed/demo.xlsx',
      fileSize: 0,
      sheetName: 'Sheet1',
      createdById: wang.id,
      committedAt: new Date('2026-11-16T08:30:00.000Z'),
      mappingJson: {
        note: '种子数据示例批次',
        columns: [
          { index: 0, target: 'student_no' },
          { index: 1, target: 'name' },
        ],
      },
      examMetaJson: {
        exam: { name: exams[2].name, type: 'midterm', heldAt: '2026-11-15' },
      },
      statsJson: {
        totalRows: 14,
        validRows: 14,
        errorRows: 0,
        warningRows: 0,
        absentCount: 1,
        inserted: 70,
        updated: 0,
      },
    },
  })

  console.log('Seed completed.')
  console.log('Accounts:')
  console.log('  admin    / admin123    (系统管理员)')
  console.log('  director / director123 (年级主任)')
  console.log('  wang     / wang123     (初二1班班主任)')
  console.log('  zhang    / zhang123    (数学任课老师)')
  console.log(`Created ${students.length} students, ${exams.length} exams, ${scoreRows.length} scores.`)
  console.log(`Admin id: ${admin.id}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })