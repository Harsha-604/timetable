# CSE Allied Timetable Coordinator

A React + Vite application for college timetable coordinators managing CSE allied branches (CIC, AIML, DS, CSIT) across academic years and sections. Features dynamic section management, Excel-based batch data import, automated multi-class conflict-free scheduling with soft-rule optimization, live manual editing with clash detection, and publication via GitHub Pages.

---

## 1. How to Fill the 3 Excel Templates

You can download blank templates directly from the respective management pages (**Faculty**, **Rooms**, **Subjects**) using the **⬇ Download Template** button.

### Sheet 1: Faculty (`faculty_template.xlsx`)
Columns:
- `Faculty Name`: Full name of the faculty member (e.g. `Dr. A. Vasanthi`).
- `Short Name`: Unique short code/initials displayed on the timetable cells (e.g. `AV`, `PPP`, `Dr.MVRJ`).
- `Designation`: Academic title (e.g. `Professor`, `Assoc Professor`, `Asst Professor`).
- `Department`: Branch or department (e.g. `CSE(CIC)`, `CSE(AIML)`).
- `Max Periods/Week`: Maximum allowed teaching periods per week (e.g. `30`).
- `Subjects`: Comma-separated list of subject codes the faculty member is qualified to teach (e.g. `BCT, DevOps Lab, BCT Lab`).
  - *Branch scoping:* You can optionally scope a subject code to a specific branch and year using the format `BRANCH-YEAR:CODE` (e.g. `CIC-4:BCT`). Unscoped codes apply to every branch-year offering that subject code.

### Sheet 2: Rooms (`rooms_template.xlsx`)
Columns:
- `Room No`: Unique room designation (e.g. `CS-111`, `CS-104`).
- `Type`: Either `Classroom` or `Lab`.
- `Lab Name`: Specific laboratory name (e.g. `LAB-5`, `LAB-6`, `LAB-8`). Leave blank for general classrooms.
- `Capacity`: Student seating capacity (e.g. `60`, `30`).

### Sheet 3: Subjects (`subjects_template.xlsx`)
Columns:
- `Branch`: Target branch (`CIC`, `AIML`, `DS`, or `CSIT`).
- `Year`: Year of study (`2`, `3`, or `4`).
- `Subject Code`: Short code displayed on the timetable grid (e.g. `PE-V:SQT`, `BCT`, `DevOps Lab`).
- `Subject Name`: Full title of the course (e.g. `Software Quality Testing`).
- `Type`: `Theory`, `Lab`, or `Project`.
- `Periods/Week`: Total class hours required per week (e.g. `3`, `4`).
- `Block Size`: Number of consecutive periods per block (e.g. `1` for theory, `2` or `3` for labs).
- `Faculty Required`: Number of faculty members needed simultaneously (defaults to `1` for Theory, `2` for Lab/Project).
- `Lab Room`: Required for `Lab` and `Project` subjects (must match a valid `Room No` in the rooms sheet, e.g. `CS-104`).
- `Common Slot Group`: Optional identifier for shared courses across multiple branches (e.g. open electives `OE-1`). All classes with the same group ID are scheduled in the identical day and period slot.

---

## 2. How to Generate Timetables

1. **Configure Classes & Sections:**
   - In **Settings**, set the number of sections (A, B, C...) for each branch and year.
   - For each class, configure its Home Classroom, working days (Mon–Sat), and Saturday periods limit.
   - Configure period timings and allowed **Lab Windows** (default: `[P1, P2]`, `[P3, P4]`, `[P5, P6]`).
2. **Import or Enter Data:**
   - Upload Faculty, Rooms, and Subjects via their respective pages or click **⭐ Load Reference Sample (CIC-4-A)** in Settings to test immediately with the reference dataset.
3. **Review & Auto-Assign (Step A):**
   - Navigate to **Generate → Step A: Review Assignments**.
   - Click **⚡ Auto-Assign All Qualified** to automatically assign qualified teaching teams to each subject while balancing faculty load.
   - You can manually adjust any faculty team or lock individual assignments.
4. **Run Multi-Class Scheduler (Step B):**
   - Switch to **Step B: Schedule & Generate**.
   - If any validation errors exist (e.g. unqualified subjects, missing lab rooms), they will be reported and generation will be safely paused until resolved.
   - Click **⚡ Generate Timetables**. The scheduler runs randomized greedy attempts with backtracking across all selected classes, keeping the schedule with 0 hard conflicts and the lowest soft penalty score, followed by an automatic swap-repair pass.

---

## 3. How to View and Edit Timetables

- **Class Timetable View:**
  - Displays periods with time ranges, days as rows, morning break, vertical Lunch column, and merged multi-period lab blocks with `(Lab Name, Room No)` displayed in emerald green.
  - Cell format:
    ```
    BCT
    (PPP)
    ```
    or for labs:
    ```
    DevOps Lab
    (PPP,AV)
    (LAB-5, CS-104)
    ```
- **Interactive Editing:**
  - **Drag and Drop:** Drag any cell onto another within a class to swap their time slots.
  - **Click to Edit:** Click any cell to modify the subject, teaching team, or room.
  - **Live Clash Detection:** If an edit conflicts with another class (e.g. "AV is in AIML-4-A at Tue P2"), a warning is immediately shown. Saving requires an explicit **Save Anyway** confirmation, and conflicted cells are highlighted in red across all views.
  - **Locking:** Click the lock icon (🔒/🔓) to fix specific cells in place, then use **⚡ Regenerate Unlocked Cells** to re-schedule only the remaining slots.
- **Faculty & Room Views:**
  - View full weekly schedules per faculty member (with max load tracking) or per room/laboratory.

---

## 4. Publishing to GitHub Pages

Timetable data edited in the browser is saved locally in `localStorage`. To make the generated schedule permanently visible to students and faculty on the public site:

1. In the sidebar footer, click **💾 Save Project** to download the project state as `data.json`.
2. Place or commit `data.json` into the `public/` folder of the repository:
   ```bash
   git add public/data.json
   git commit -m "Publish updated timetables"
   git push origin master
   ```
3. The GitHub Actions Deploy workflow (`.github/workflows/deploy.yml`) will automatically trigger, build the application, and publish the site to GitHub Pages.
4. **Public vs. Editor Routes:**
   - The default URL (`/` or `/timetable/`) opens the clean, read-only viewer for students and faculty with search by faculty name.
   - The coordinator editor is accessible at `#edit` (e.g. `/timetable/#edit`) or by clicking **⚙️ Edit Mode** in the top navigation.
