const { google } = require('googleapis');

const CATEGORIES = {
  "Maths Homework Winner": 1,
  "Maths Homework Runner Ups": 0.5,
  "Writing Homework Winner": 1,
  "Book Review Winner": 1,
  "Book Review Test Highest Scores": 1,
  "Forgotten stationery (first-time)": 0,
  "Forgotten stationery (second-time)": -0.5,
  "No Maths Homework": -1,
  "No Writing Homework": -1,
  "No highlighting (first-time)": 0,
  "No highlighting (second-time)": -0.5
};

exports.handler = async (event) => {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const auth = new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    if (event.httpMethod === 'GET') {
      // 1. Fetch the homework logs
      const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Sheet1!A2:E' });
      const rows = response.data.values || [];
      
      // 2. Fetch the student names from the Students tab
      const studentsResponse = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'Students!A2:A' });
      const students = (studentsResponse.data.values || []).flat(); // This turns the rows into a simple list

      // 3. Calculate totals
      const studentTotals = {};
      rows.forEach(row => {
        const [timestamp, student, week, category, points] = row;
        if (!studentTotals[student]) studentTotals[student] = 0;
        studentTotals[student] += parseFloat(points || 0);
      });
      
      // 4. Send both logs, totals, AND the student list to the frontend
      return { statusCode: 200, body: JSON.stringify({ logs: rows, totals: studentTotals, students: students }) };
    }

    if (event.httpMethod === 'POST') {
      const { student, week, category } = JSON.parse(event.body);
      const points = CATEGORIES[category];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId, range: 'Sheet1!A:E', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), student, week, category, points]] },
      });
      return { statusCode: 200, body: JSON.stringify({ message: 'Log added successfully!' }) };
    }
    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
