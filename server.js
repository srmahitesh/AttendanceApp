import express from "express";
import mySql from "mysql2/promise";
import { config } from "dotenv";
import bcrypt from "bcryptjs"; //To save the passwords encryptly
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";

config();

const AppPort = process.env.AppPort || 8080;
const app = express();

const saltRounds = await bcrypt.genSalt(10); //More the saltrounds, stronger the hashing is done in password. But this is sufficient for us

app.use(bodyParser.urlencoded({ extended: false })); // Parse form data

app.use(
  session({
    secret: "HS",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 15 }, // 15 minutes
  })
);

app.use(passport.initialize()); // Initialize Passport
app.use(passport.session()); // Persist sessions
app.use(express.json());

async function activateDb() {
  let conn;
  try {
    conn = await mySql.createConnection({
      host: process.env.db_host,
      database: process.env.db_name,
      user: process.env.db_user,
      password: process.env.db_password,
      port: process.env.db_port,
    });
    console.log(`Connection Success with DB`);
    return conn;
  } catch (error) {
    console.log(`Unable to Connect with Db, ${error.stack}`);
    throw error;
  }
}

//TO LOAD THE HOME PAGE OF WEB APPLICATION
app.get("/", async (req, res) => {
  res.render("HomePage.ejs");
});

//TO OPEN REGISTRATION PAGE
app.get("/student_register", async (req, res) => {
  let conn;
  try {
    conn = await activateDb();
    let [result] = await conn.query(`SELECT * FROM courses`);
    console.log(result);
    res.render("registrationPage.ejs", { courses: result });
  } catch (err) {
    console.log("Error While Fetching courses " + err.stack);
    res.status(403).send("Unable to Connect to DB");
  } finally {
    if (conn) conn.end();
  }
});

//Registring Teacher
app.get("/staff_register", async (req, res) => {
  res.render("staff_RegistrationPage.ejs");
});

//TO SAVE THA DATA OF NEWLY REGISTERED STUDENTS AND CHECKING IF HE IS REALLY NEW OR EXISTING ONE WITH PRIMARY KEY AS AADHAR
app.post("/submit", async (req, res) => {
  console.log(req.body);
  let data = req.body;
  let conn;

  try {
    conn = await activateDb();
    let [duplicateData] = await conn.query(
      `SELECT roll_no FROM students where aadhar_no = '${data.aadhar_no}' OR roll_no = '${data.roll_no}' LIMIT 1`
    );
    if (duplicateData.length > 0) {
      let [{ roll_no }] = duplicateData[0];
      console.log(duplicateData);
      res.send(
        `<h1>Student with Same ID already exists (Roll NO. ${roll_no})</h1>`
      );
    } else {
      try {
        let temp = await conn.query(`INSERT INTO students VALUES(${data.roll_no}, '${data.f_name.toUpperCase()}', '${data.l_name.toUpperCase()}', '${data.dob}', '${data.father_name.toUpperCase()}', '${data.mother_name.toUpperCase()}', '${data.gender}', ${data.course}, '${data.contact_no}', '${data.email_add.toLowerCase()}', '${data.aadhar_no}', '${data.house_no}', '${data.street_add}' , '${data.city}', '${data.distt}', '${data.state}', '${data.country}', '${data.pin_code}', ${data.sem})`);

        try {
          let [result] = await conn.query(
            `SELECT roll_no FROM students WHERE aadhar_no = ${data.aadhar_no}`
          );
          console.log(result);
          let assign_roll_no = result[0].roll_no;
          console.log(assign_roll_no);

          try {
            let pass =
              data.f_name.substr(0, 4).toUpperCase() +
              data.dob.substr(0, 4) +
              data.pin_code +
              data.aadhar_no.substr(8, 12); // Corrected substring end index

            console.log(pass);
            let hashedPassword;
            try {
              hashedPassword = await bcrypt.hash(pass, saltRounds);
            } catch (error) {
              console.log(`Unable to hash the password`);
              return res.send(
                `Unable to create an account, rest assured Registration Success with ${assign_roll_no}.`
              );
            }
            console.log(hashedPassword);

            await conn.query(
              `INSERT INTO studentCred VALUES(?, ?)`,
              [assign_roll_no, hashedPassword]
            );
            res.send(
              `Registered Successfully with Roll Number ${assign_roll_no}. Login Now with your Roll Number (${assign_roll_no}) & use [4 Character of First Name] + [YYYY (from DOB)] + [Pin Code] + [Last 4 Digits of Aadhar] as Your Password.`
            );
          } catch (error) {
            console.error(
              `Error inserting into studentCred: ${error.stack}`
            );
            res.send(
              `Unable to Register Your Account, Rest Assured, Your Registration is Successful with Roll Number : ${assign_roll_no}`
            );
          }
        } catch (error) {
          console.error(`Error fetching roll_no: ${error.stack}`);
          res.send(
            `Thank You for Registration, It's Taking Longer than Usual, Try after Some time.`
          );
        }
      } catch (err) {
        console.error(`Error inserting into students: ${err.stack}`);
        res.status(500).send("Unable to register" + err.stack);
      }
    }
  } catch (err) {
    console.error(`Error validating details: ${err.stack}`);
    res.status(500).send("Unable to Validate Details" + err.stack);
  } finally {
    if (conn) conn.end();
  }
});

app.post("/staffDetails", async (req, res) => {
  const user = req.body;
  console.log(user);
  let conn;

  const queryInsert = `INSERT INTO faculty (id, name, dob, gender, contact_no, email_add, house_no, street_add, city, distt, state, country, pin_code, password, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  try {
    conn = await activateDb();

    try {
      // 1. Check if ID already exists
      const [existing] = await conn.query(
        `SELECT id FROM faculty WHERE id = ?`,
        [user.id]
      );
      if (existing.length > 0) {
        return res
          .status(409)
          .send(`Employee already exists with same employee ID.`);
      }

      // 2. Insert new staff details
      await conn.query(queryInsert, [
        user.id,
        user.name,
        user.dob,
        user.gender,
        user.contact_no,
        user.email_add,
        user.house_no,
        user.street_add,
        user.city,
        user.distt,
        user.state,
        user.country,
        user.pin_code,
        user.password,
        user.status,
      ]);

      res.send(`Your Registration request has been taken Successfully. You will be able login with Employee id & Password, once it's approved by the Admin.`);
    } catch (queryErr) {
      console.error(`Query Error:`, queryErr.stack);
      res.status(500).send(`Error inserting employee data.`);
    }
  } catch (connErr) {
    console.error(`Connection Error:`, connErr.stack);
    res.status(500).send(`Unable to connect with DB.`);
  } finally {
    if (conn) conn.end();
  }
});

function ensureAuthenticated(req, res, next) {
  //middleware to ensure session is still established
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/");
}

//Student Side
app.get("/stu_login", (req, res) => {
  res.render("SignIn_Stu.ejs");
});

//TO verify the login credential of the users
app.post(
  "/verify_stu_login",
  passport.authenticate("student-local", { failureRedirect: "/stu_login" }),
  (req, res) => {
    res.redirect("/student_dashboard");
  }
);

app.get("/student_dashboard", ensureAuthenticated, (req, res) => {
  if (req.user.role === "student") {
    console.log(
      `This data is being sent to student dashboard page initially ${JSON.stringify(
        req.user
      )}`
    );
    res.render("student_dashboard.ejs", { user: req.user });
  } else {
    res.redirect("/");
  }
});

//Principal Side
app.get("/principal_login", (req, res) => {
  // May update
  res.render("SignIn_Principal.ejs");
});

app.post(
  "/verify_principle_login",
  passport.authenticate("principal-local", {
    failureRedirect: "/principal_login",
  }),
  (req, res) => {
    console.log("techer Authenitcation Success");
    res.redirect("/principal_dashboard");
  }
);

app.get("/principal_dashboard", ensureAuthenticated, (req, res) => {
  if (req.user.role === "principal") {
    console.log(
      `This data is being sent to principal dashboard page initially ${req.user}`
    );
    res.render("principal_dashboard.ejs", { user: req.user });
  } else {
    res.redirect("/principal_login");
  }
});

//Teacher side
app.get("/teach_login", (req, res) => {
  res.render("SignIn_Teach.ejs");
});

//TO verify the login credential of the users
app.post(
  "/verify_teach_login",
  passport.authenticate("teacher-local", { failureRedirect: "/teach_login" }),
  (req, res) => {
    console.log("techer Authenitcation Success");
    res.redirect("/teacher_dashboard");
  }
);

app.get("/teacher_dashboard", ensureAuthenticated, (req, res) => {
  if (req.user.role === "teacher") {
    console.log(
      `This data is being sent to teacher dashboard page initially ${req.user}`
    );
    res.render("teacher_dashboard.ejs", { user: req.user });
  } else {
    res.redirect("/");
  }
});

app.get("/mark_attendance", ensureAuthenticated, (req, res) => {
  if (req.user.role === "teacher") {
    res.render("mark_attendance.ejs", { user: req.user });
  } else {
    res.redirect("/");
  }
});

app.get("/getStudents", async (req, res) => {
  const { stream, sem } = req.query; // Extract query parameters
  console.log(`Stream: ${stream}, Semester: ${sem}`); // Log for debugging
  let conn;

  try {
    conn = await activateDb(); // Connect to the database
    // Use stream and sem to fetch students
    const [result] = await conn.query(
      `SELECT roll_no, first_name, last_name FROM students WHERE sem = ? AND course_id = ?`,
      [sem, stream]
    );

    if (result.length > 0) {
      res.json(result); // Return student data
    } else {
      res.json([]); // Return an empty array if no students found
    }
  } catch (error) {
    console.error("Error fetching students:", error.message);
    res
      .status(500)
      .json({ error: "An error occurred while fetching students." });
  } finally {
    if (conn) conn.end();
  }
});

app.get("/getSubjects", async (req, res) => {
  const { stream, sem } = req.query;
  console.log(
    `Fetching Subjects & got credential: Course_id ${stream} Sem: ${sem}`
  );
  let conn;
  try {
    conn = await activateDb();
    let [result] = await conn.query(
      `SELECT sub_id, name FROM subjects WHERE course_id = '${stream}' AND sem = '${sem}'`
    );
    res.json({ subjects: result });
  } catch (error) {
    res.json({ error: "Unable to Fetch Subjects." });
  } finally {
    if (conn) conn.end();
  }
});

app.post("/submitAttendance", ensureAuthenticated, async (req, res) => {
  const attendanceData = req.body;
  console.log("Received attendance data:", attendanceData); // Log the received data
  let conn;

  if (
    !attendanceData ||
    !Array.isArray(attendanceData) ||
    attendanceData.length === 0
  ) {
    console.error("Invalid attendance data received."); // Log error for invalid data
    return res
      .status(400)
      .json({ success: false, message: "Invalid attendance data." });
  }

  try {
    conn = await activateDb();
    console.log("Database connection established."); // Log successful DB connection

    const promises = attendanceData.map((entry) => {
      const { roll_no, status, sub_name, faculty_id, faculty_name } = entry;

      // Log each entry being processed
      console.log("Processing entry:", entry);

      if (!roll_no || !status || !sub_name || !faculty_id || !faculty_name) {
        console.error("Incomplete attendance entry:", entry); // Log incomplete entry
        throw new Error("Incomplete attendance entry.");
      }

      return conn.query(
        `INSERT INTO attendance (roll_no, status, subject_name, faculty_id, faculty_name, att_date) VALUES (?, ?, ?, ?, ?, NOW())`,
        [roll_no, status, sub_name, faculty_id, faculty_name]
      );
    });

    await Promise.all(promises);
    console.log("All attendance entries have been successfully saved."); // Log success

    res
      .status(200) 
      .json({ success: true, message: "Attendance submitted successfully!" });
  } catch (error) {
    console.error("Error saving attendance:", error); // Log the error
    res
      .status(500)
      .json({ success: false, message: "Error saving attendance. Please try again." });
  } finally {
    if (conn) conn.end();
  }
});

app.get("/attendanceCorrection", ensureAuthenticated, async (req, res) => {
  res.render("correct_attendance.ejs", { user: req.user });
});

app.get("/getAttendanceById", ensureAuthenticated, async (req, res) => {
  const { id } = req.query;
  let conn;

  try {
    conn = await activateDb();
    const [rows] = await conn.query(
      `SELECT * FROM attendance WHERE attend_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.json({ error: "Attendance ID not found." });
    }

    const attendance = rows[0];

    // Ensure faculty ID matches
    if (attendance.faculty_id !== req.user.id) {
      return res.json({
        error: "You are not authorized to modify this attendance record.",
      });
    }

    res.json(attendance);
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ error: "Failed to fetch attendance." });
  } finally {
    if (conn) conn.end();
  }
});

app.post("/updateAttendance", ensureAuthenticated, async (req, res) => {
  const { att_id, status } = req.body;
  let conn;

  try {
    conn = await activateDb();

    // Verify faculty ownership before updating
    const [rows] = await conn.query(
      `SELECT * FROM attendance WHERE attend_id = ?`,
      [att_id]
    );

    if (rows.length === 0) {
      return res.json({ error: "Attendance ID not found." });
    }

    const attendance = rows[0];

    if (attendance.faculty_id !== req.user.id) {
      return res.json({
        error: "You are not authorized to modify this attendance record.",
      });
    }

    // Update attendance
    await conn.query(
      `UPDATE attendance SET status = ? WHERE attend_id = ?`,
      [status, att_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({ error: "Failed to update attendance." });
  } finally {
    if (conn) conn.end();
  }
});

app.get("/getAttendance", ensureAuthenticated, async (req, res) => {
  const { roll_no, subject } = req.query;
  let conn;

  if (!roll_no) {
    return res.status(400).json({ error: "Roll number is required." });
  }

  try {
    let query = `
      SELECT attend_id, subject_name, subject_name, status, faculty_name, att_date
      FROM attendance
      WHERE roll_no = ?
    `;
    const params = [roll_no];

    if (subject) {
      console.log("Specific sub req: " + subject);
      query += ` AND subject_name = ?`;
      params.push(subject);
    }
    conn = await activateDb();

    const [attendanceRecords] = await conn.query(query, params);

    if (attendanceRecords.length === 0) {
      return res.status(404).json({ error: "No attendance data found." });
    }

    res.json({ attendance: attendanceRecords });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ error: "Failed to fetch attendance." });
  } finally {
    if (conn) conn.end();
  }
});

app.get("/parents", async (req, res) => {
  res.render("parents.ejs");
});

app.get("/getFullAttendance", async (req, res) => {
  const { roll_no } = req.query;
  let conn;

  if (!roll_no) {
    return res.status(400).json({ error: "Roll number is required." });
  }

  try {
    conn = await activateDb();
    const query = `SELECT att_date, subject_name, status FROM attendance WHERE roll_no = '${roll_no}' ORDER BY att_date DESC`;
    const [rows] = await conn.query(query);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No attendance records found for this roll number." });
    }
    res.json({ attendance: rows });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res
      .status(500)
      .json({ error: "Internal server error. Please try again later." });
  } finally {
    if (conn) conn.end();
  }
});



app.get('/attendance-summary', ensureAuthenticated, async(req, res) => {
  const sql = `
    SELECT s.roll_no, 
           s.first_name, 
           s.last_name, 
           s.sem, 
           c.course_name, 
           COUNT(a.status) AS total_attendance, 
           SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS total_present,
           ROUND(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) * 100.0 / COUNT(a.status), 2) AS percentage
    FROM students s
    JOIN attendance a ON s.roll_no = a.roll_no
    JOIN courses c ON s.course_id = c.course_id
    GROUP BY s.roll_no, s.first_name, s.last_name, s.sem, c.course_name
  `;

  try{
    const conn = await activateDb();
    const [result] = await conn.query(sql);
    conn.close();
    res.render('attendance-summary.ejs', { data: result })
  }
  catch(error){
    res.status(500).send("Unable to fetch data.")
  }
});




app.get('/faculty/requests', ensureAuthenticated, async (req, res) => {
  const sql = `SELECT * FROM faculty WHERE status = 0`;

  try {
    const conn = await activateDb();
    const [result] = await conn.query(sql);
    console.log(result);
    conn.close();
    res.render('faculty-requests.ejs', { data: result });
  } catch (err) {
    res.status(500).send("Error loading faculty list.");
  }
});



app.post('/faculty/accept/:id', ensureAuthenticated, async (req, res) => {
  const id = req.params.id;
  const sql = `UPDATE faculty SET status = 1 WHERE id = ?`;

  try {
    const conn = await activateDb();
    await conn.query(sql, [id]);
    conn.close();
    res.redirect('/faculty/requests');
  } catch (err) {
    console.log(err.stack);
    res.status(500).send("Error accepting faculty.");
  }
});




app.post('/faculty/reject/:id', ensureAuthenticated, async (req, res) => {
  const id = req.params.id;
  const sql = `DELETE FROM faculty WHERE id = ?`;

  try {
    const conn = await activateDb();
    await conn.query(sql, [id]);
    conn.close();
    res.redirect('/faculty/requests');
  } catch (err) {
    console.log(err.stack);
    res.status(500).send("Error rejecting faculty.");
  }
});





app.listen(AppPort, () => {
  console.log(`App is listening at the PORT ${AppPort}`);
  console.log(`http://localhost:${AppPort}`);
});

passport.use(
  "student-local",
  new Strategy(
    {
      usernameField: "username",
      passwordField: "password",
      passReqToCallback: true,
    },
    async (req, username, password, done) => {
      let conn;
      try {
        conn = await activateDb();
        const [rows] = await conn.query(
          `SELECT * FROM studentCred WHERE roll_no = ?`,
          [username]
        );

        if (rows.length === 0) {
          return done(null, false, {
            message: `User doesn't exist! Please register first.`,
          });
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          user.role = req.body.role; // Attach role
          return done(null, user);
        } else {
          return done(null, false, { message: "Incorrect password." });
        }
      } catch (error) {
        console.error("Error during authentication:", error.message);
        return done(error);
      } finally {
        if (conn) conn.end();
      }
    }
  )
);

passport.use(
  "teacher-local",
  new Strategy(
    {
      usernameField: "username",
      passwordField: "password",
      passReqToCallback: true,
    },
    async (req, username, password, done) => {
      let conn;
      try {
        conn = await activateDb();
        const [rows] = await conn.query(
          `SELECT * FROM faculty WHERE id = ? AND status = ?`,
          [username, 1]
        );

        if (rows.length === 0) {
          return done(null, false, {
            message: `User doesn't exist! Please register first.`,
          });
        }

        const user = rows[0];
        if (user.password === password) {
          user.role = req.body.role; // Attach role
          return done(null, user);
        } else {
          return done(null, false, { message: "Incorrect password." });
        }
      } catch (error) {
        console.error("Error during authentication:", error.message);
        return done(error);
      } finally {
        if (conn) conn.end();
      }
    }
  )
);

passport.use(
  "principal-local",
  new Strategy(
    {
      usernameField: "username",
      passwordField: "password",
      passReqToCallback: true,
    },
    async (req, username, password, done) => {
      let conn;
      try {
        conn = await activateDb();
        const [rows] = await conn.query(
          `SELECT * FROM admins WHERE id = ?`,
          [username]
        );

        if (rows.length === 0) {
          return done(null, false, {
            message: `Principal doesn't exist! Please contact admin.`,
          });
        }

        const user = rows[0];
        console.log(user);
        if (user.password === password) {
          user.role = req.body.role; // Attach role  May Update
          return done(null, user);
        } else {
          return done(null, false, { message: "Incorrect password." });
        }
      } catch (error) {
        console.error("Error during principal authentication:", error.message);
        return done(error);
      } finally {
        if (conn) conn.end();
      }
    }
  )
);

passport.serializeUser((user, done) => {
  const key = { id: user.roll_no || user.id, role: user.role };
  console.log(`Serializer Key: ${JSON.stringify(key)}`);
  done(null, key);
});

passport.deserializeUser(async (key, done) => {
  const { id, role } = key;
  let conn;
  let query;
  if (role === "student") {
    query = `SELECT * FROM students WHERE roll_no = ?`;
  } else if (role === "teacher") {
    query = `SELECT * FROM faculty WHERE id = ?`;
  } else if (role === "principal") {
    // May Update for super admin
    query = `SELECT * FROM admins WHERE id = ?`;
  }

  try {
    conn = await activateDb();
    const [rows] = await conn.query(query, [id]);

    if (rows.length > 0) {
      rows[0].role = role; // Reattach role
      done(null, rows[0]);
    } else {
      done(null, false);
    }
  } catch (error) {
    console.error("Error during deserialization:", error.message);
    done(error);
  } finally {
    if (conn) conn.end();
  }
});