const mysql = require('mysql');

var connection = mysql.createConnection({
  host: 'localhost',
  database: 'rpm-test',
  user: 'root', // Use your MySQL Workbench username
  password: 'T.4.$.1.!.h' // Use your MySQL Workbench password
});

connection.connect(function(error) {
  if (error) {
    throw error;
  } else {
    console.log('MySQL Database is connected Successfully');
  }
});

module.exports = connection;