const { google } = require('googleapis');

// Categories for SL
const CATEGORIES_CLASS_1 = {
  "Maths Homework Winner": 1,
  "Maths Homework Runner Ups": 0.5,
  "Writing Homework Winner": 1,
  "Book Review Winner": 1,
  "Book Review Runner Up": 0.5, // NEW CATEGORY
  "Book Review Test Highest Scores": 1,
  "Book Review Test Fail": -1,
  "Forgotten stationery": 0,
  "Forgot Writing Homework Folder": 0,
  "No Maths Homework": -1,
  "No Writing Homework": -1,
  "No highlighting": 0
};

// CATEGORIES FOR MASTERY A & MASTERY B
const CATEGORIES_OTHER = {
  "Writing HW Winner": 1,
  "Maths HW Winner": 1,
  "Non-submission of writing HW": -1,
  "Non-submission of maths HW": -1,
  "Forgetting stationery": 0,
  "Poor HW quality": 0
};

const AUTO_TRACKED = [
  "Forgotten stationery", 
  "No highlighting", 
  "Forgot Writing Homework Folder",
  "Forgetting stationery",
  "Poor HW quality"
];

exports.handler = async (event) => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const auth = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    if (event.httpMethod === 'GET') {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A2:F' });
      const rows = response.data.values || [];
      
      const s1 = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Students1!A2:A' });
      const s2 = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Students2!A2:A' });
      const s3 = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Students3!A2:A' });

      const students = {
        "SL": (s1.data.values || []).flat(),
        "Mastery A": (s2.data.values || []).flat(),
        "Mastery B": (s3.data.values || []).flat()
      };

      const studentTotals = {};
      rows.forEach(row => {
        const [timestamp, className, student, week, category, points] = row;
        if (!className || !student) return;
        if (!studentTotals[className]) studentTotals[className] = {};
        if (!studentTotals[className][student]) studentTotals[className][student] = 0;
        studentTotals[className][student] += parseFloat(points || 0);
      });
      
      return { statusCode: 200, body: JSON.stringify({ logs: rows, totals: studentTotals, students: students }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      
      if (body.action === 'reset') {
        const { student, className } = body;
        const historyResponse = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A2:F' });
        const historyRows = historyResponse.data.values || [];
        
        let currentTotal = 0;
        historyRows.forEach(row => {
          if (row[1] === className && row[2] === student) {
            currentTotal += parseFloat(row[5] || 0);
          }
        });

        const offsetPoints = currentTotal * -1; 

        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId, range: 'Sheet1!A:F', valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), className, student, 'N/A', 'Suspension Served - Reset to 0', offsetPoints]] },
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Student reset successfully!' }) };
      }

      const { student, week, category, className } = body;
      const categorySet = className === "SL" ? CATEGORIES_CLASS_1 : CATEGORIES_OTHER;
      let points = categorySet[category];
      let finalCategoryName = category;

      if (AUTO_TRACKED.includes(category)) {
        const historyResponse = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A2:F' });
        const historyRows = historyResponse.data.values || [];
        
        const pastOccurrences = historyRows.filter(row => 
          row[1] === className && 
          row[2] === student && 
          row[4] && row[4].includes(category)
        ).length;
        
        if (pastOccurrences === 0) {
          points = 0;
          finalCategoryName = `${category} (first-time)`;
        } else {
          points = -0.5;
          finalCategoryName = `${category} (subsequent)`;
        }
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId, range: 'Sheet1!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), className, student, week, finalCategoryName, points]] },
      });
      return { statusCode: 200, body: JSON.stringify({ message: 'Log added successfully!' }) };
    }
    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
