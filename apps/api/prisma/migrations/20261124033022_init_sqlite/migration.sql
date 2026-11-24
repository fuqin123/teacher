-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_year" TEXT NOT NULL,
    "term_no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATETIME,
    "end_date" DATETIME,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term_id" TEXT NOT NULL,
    "entry_year" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "grades_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "class_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entry_year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grade_id" TEXT NOT NULL,
    "class_group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "head_teacher_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "classes_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "classes_class_group_id_fkey" FOREIGN KEY ("class_group_id") REFERENCES "class_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "classes_head_teacher_id_fkey" FOREIGN KEY ("head_teacher_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "student_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "student_term_enrollments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    CONSTRAINT "student_term_enrollments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "student_term_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "student_term_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'cultural',
    "default_full_score" DECIMAL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "grade_directors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grade_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "grade_directors_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "grade_directors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    CONSTRAINT "teaching_assignments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "teaching_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "teaching_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "teaching_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "held_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exams_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exams_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exams_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "full_score" DECIMAL NOT NULL,
    "included_in_total" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "exam_subjects_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exam_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "score" DECIMAL,
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "import_batch_id" TEXT,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scores_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scores_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "scores_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "scores_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exam_id" TEXT,
    "class_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_hash" TEXT,
    "file_size" INTEGER NOT NULL,
    "sheet_name" TEXT,
    "header_fingerprint" TEXT,
    "mapping_json" JSONB,
    "parsed_data_json" JSONB,
    "validation_json" JSONB,
    "stats_json" JSONB,
    "exam_meta_json" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" DATETIME,
    CONSTRAINT "import_batches_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "import_batches_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "score_change_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_id" TEXT,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "old_score" DECIMAL,
    "old_absent" BOOLEAN,
    "new_score" DECIMAL,
    "new_absent" BOOLEAN,
    "action" TEXT NOT NULL,
    "operated_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "score_change_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "score_change_logs_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "score_change_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "score_change_logs_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "score_change_logs_operated_by_id_fkey" FOREIGN KEY ("operated_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "detail_json" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value_json" JSONB NOT NULL,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "sid" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "expire_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_school_year_term_no_key" ON "academic_terms"("school_year", "term_no");

-- CreateIndex
CREATE INDEX "grades_entry_year_idx" ON "grades"("entry_year");

-- CreateIndex
CREATE UNIQUE INDEX "grades_term_id_level_key" ON "grades"("term_id", "level");

-- CreateIndex
CREATE UNIQUE INDEX "class_groups_entry_year_name_key" ON "class_groups"("entry_year", "name");

-- CreateIndex
CREATE UNIQUE INDEX "classes_grade_id_name_key" ON "classes"("grade_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_no_key" ON "students"("student_no");

-- CreateIndex
CREATE INDEX "student_term_enrollments_class_id_term_id_idx" ON "student_term_enrollments"("class_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_enrollments_term_id_student_id_key" ON "student_term_enrollments"("term_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "grade_directors_grade_id_user_id_key" ON "grade_directors"("grade_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_term_id_user_id_class_id_subject_id_key" ON "teaching_assignments"("term_id", "user_id", "class_id", "subject_id");

-- CreateIndex
CREATE INDEX "exams_term_id_grade_id_held_at_idx" ON "exams"("term_id", "grade_id", "held_at");

-- CreateIndex
CREATE UNIQUE INDEX "exams_term_id_grade_id_name_key" ON "exams"("term_id", "grade_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subjects_exam_id_subject_id_key" ON "exam_subjects"("exam_id", "subject_id");

-- CreateIndex
CREATE INDEX "scores_exam_id_subject_id_idx" ON "scores"("exam_id", "subject_id");

-- CreateIndex
CREATE INDEX "scores_student_id_exam_id_idx" ON "scores"("student_id", "exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "scores_exam_id_student_id_subject_id_key" ON "scores"("exam_id", "student_id", "subject_id");

-- CreateIndex
CREATE INDEX "import_batches_created_at_idx" ON "import_batches"("created_at");

-- CreateIndex
CREATE INDEX "import_batches_created_by_id_idx" ON "import_batches"("created_by_id");

-- CreateIndex
CREATE INDEX "import_batches_class_id_idx" ON "import_batches"("class_id");

-- CreateIndex
CREATE INDEX "score_change_logs_exam_id_idx" ON "score_change_logs"("exam_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "user_sessions_expire_at_idx" ON "user_sessions"("expire_at");
