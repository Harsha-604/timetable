# CSE Allied Timetable Coordinator

A React + Vite application for college timetable coordinators managing CSE allied branches (CIC, AIML, DS, CSIT) across academic years and sections. Features dynamic section management, Excel-based batch data import, automated multi-class conflict-free scheduling with soft-rule optimization, and live manual editing with clash detection.

## Hosted app and shared data

- **Live site:** [https://cse-allied-timetable.web.app](https://cse-allied-timetable.web.app)
- Sign in with an approved Google account to use the coordinator.
- Timetable project data is synchronized through Cloud Firestore, so approved users can continue the same project on different devices.
- The first approved sign-in creates the shared cloud copy from that browser's local project if no cloud copy exists yet. Sign in first on the browser that contains the latest project data.
- Later edits sync automatically. **Save Project** and **Load Project** remain available for JSON backups.
- Only email addresses allowed by the Firestore Security Rules can read or edit the shared project. Add or remove access by updating the allowlist in Firebase Console.

## Invigilation availability checker

1. Open **Invigilation** and upload a faculty timetable workbook (`.xlsx`, `.xls`, or `.xlsm`).
2. Choose the exam date, start and end times, and semester.
3. The eligible list includes faculty with no occupied timetable period during the exam or the one-hour buffer before and after it.
4. Timetable periods identified as belonging to the selected semester are treated as free for this exam. Results display period times without subject names.
5. Service faculty, HODs, AHODs, and Dr. B. Sandhya are excluded.

The uploaded invigilation workbook is parsed in the browser and is not saved to Firestore; upload it again after refreshing or opening the app on another device.

## Local development

Requirements: Node.js 18 or later and npm.

```powershell
npm install
npm run dev
```

Firebase web configuration is in `src/firebase.js`. To use a different Firebase project, register a web app in Firebase Console and replace the configuration values with that app's config.

The app uses Google Authentication and Cloud Firestore. Firestore access should remain closed except for the intended users. The deployed app uses the `sharedTimetables/main` document; an allowlist rule can be configured in **Firebase Console → Firestore Database → Rules**:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sharedTimetables/main {
      allow read, write: if request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.token.email in [
          "allowed-user@example.com",
          "another-allowed-user@example.com"
        ];
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Replace the example addresses with the exact Google account emails that should have access. Do not publish rules with the example addresses unchanged.

## Deploy to Firebase Hosting

The repository is configured to build the Vite app into `dist` and deploy that folder to Firebase Hosting.

```powershell
npm install -g firebase-tools
firebase login
npm run build
firebase deploy --only hosting
```

`firebase deploy --only hosting` deploys the website only; it does not deploy or change Firestore rules. The default Firebase Hosting URL is `https://cse-allied-timetable.web.app`.

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

## 4. Save and load project data

Timetable project data is synchronized to Firestore for approved Google accounts. Use **Save Project** in the sidebar to download a JSON backup, and **Load Project** to restore a previously saved backup.
