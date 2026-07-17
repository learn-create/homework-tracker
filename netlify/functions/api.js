const { google } = require('googleapis');

const CATEGORIES = {
  "Maths Homework Winner": 1,
  "Maths Homework Runner Ups": 0.5,
  "Writing Homework Winner": 1,
  "Book Review Winner": 1,
  "Book Review Test Highest Scores": 1,
  "Book Review Test Fail": -1,
  "Forgotten stationery": 0, // We will calculate this dynamically below
  "No Maths Homework": -1,
  "No Writing Homework": -1,
  "No highlighting": 0 // We will calculate this dynamically below
};

exports.handler = async (event) => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const auth = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    if (event.httpMethod === 'GET') {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A2:E' });
      const rows = response.data.values || [];
      
      const studentsResponse = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Students!A2:A' });
      const students = (studentsResponse.data.values || []).flat();

      const studentTotals = {};
      rows.forEach(row => {
        const [timestamp, student, week, category, points] = row;
        if (!studentTotals[student]) studentTotals[student] = 0;
        studentTotals[student] += parseFloat(points || 0);
      });
      
      return { statusCode: 200, body: JSON.stringify({ logs: rows, totals: studentTotals, students: students }) };
    }

    if (event.httpMethod === 'POST') {
      const { student, week, category } = JSON.parse(event.body);
      let points = CATEGORIES[category];
      let finalCategoryName = category;

      // Auto-tracking logic for Forgotten Stationery and No Highlighting
      if (category === "Forgotten stationery" || category === "No highlighting") {
        // 1. Get all past logs to check how many times this has happened
        const historyResponse = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A2:E' });
        const historyRows = historyResponse.data.values || [];
        
        // 2. Count how many times this student has had this specific category before
        const pastOccurrences = historyRows.filter(row => row[1] === student && row[3] && row[3].includes(category)).length;
        
        // 3. Assign points and name based on history
        if (pastOccurrences === 0) {
          points = 0;
          finalCategoryName = `${category} (first-time)`;
        } else {
          points = -0.5;
          finalCategoryName = `${category} (second-time)`;
        }
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId, range: 'Sheet1!A:E', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), student, week, finalCategoryName, points]] },
      });
      return { statusCode: 200, body: JSON.stringify({ message: 'Log added successfully!' }) };
    }
    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
