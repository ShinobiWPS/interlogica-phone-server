import { queue } from 'async'
import csv from 'csv-parser'
import express from 'express'
import { body, validationResult } from 'express-validator'
import { createReadStream, createWriteStream, readFileSync, unlink } from 'fs'
import multer from 'multer'

const app = express()
const port = 8080
const upload = multer({ dest: 'uploads/' })

const processRow = (row, validNumbers, invalidNumbers, callback) => {
  // Extract the phone number from the row
  const phoneNumber = row.phone_number.trim()

  // Define a regular expression to match the phone number format
  const phoneRegex = /^(27|0)[1-8][0-9]{8}$/

  // Check if the phone number matches the regex
  if (phoneRegex.test(phoneNumber)) {
    // Save the valid phone number
    validNumbers.write(`${row.id},${phoneNumber}\n`)
  } else {
    // Save the invalid phone number
    invalidNumbers.write(`${row.id},${phoneNumber}\n`)
  }

  // Call the callback function when done processing
  callback()
}

// Define the function to read the CSV file and process each row asynchronously
const processCsv = (filename, validNumbers, invalidNumbers, callback) => {
  createReadStream(filename)
    .pipe(csv())
    .on('data', (row) => {
      // Use the async module to process each row asynchronously
      queue((callback) => {
          processRow(row, validNumbers, invalidNumbers, callback)
        }, 1)
        .push()
    })
    .on('end', () => {
      console.log('CSV file processing complete')
      callback()
    })
}

app.post(
  '/validate-phone-book',
  upload.single('csv'),
  [
    body('csv').custom((value, { req }) => {
      if (!req.file) {
        throw new Error('CSV file is required')
      }

      if (!req.file.originalname.match(/\.csv$/)) {
        throw new Error('Invalid file format')
      }

      return true
    }),
  ],
  (req, res) => {
    // Validate the request body
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    // Get the path of the uploaded file
    const filePath = req.file.path

    // Open the files to save the valid and invalid phone numbers
    const validNumbers = createWriteStream('valid_numbers.csv', {
      flags: 'w',
    })
    const invalidNumbers = createWriteStream('invalid_numbers.csv', {
      flags: 'w',
    })

    // Define a counter for the number of phone numbers
    let count = 0
    let validCount = 0
    let invalidCount = 0

    // Process the CSV file and save the valid and invalid phone numbers
    processCsv(filePath, validNumbers, invalidNumbers, () => {
      // Close the files
      validNumbers.end()
      invalidNumbers.end()
      // Get the number of phone numbers
      const data = readFileSync('valid_numbers.csv', 'utf8')
      count = data.split('\n').length - 1
      validCount = count

      const data2 = readFileSync('invalid_numbers.csv', 'utf8')
      count = count + (data2.split('\n').length - 1)
      invalidCount = data2.split('\n').length - 1

      // Return a JSON response with the count of phone numbers, how many are valid and invalid
      res.json({ count, validCount, invalidCount })
    })
    // Delete the uploaded file
    unlink(filePath, (err) => {
      if (err) {
        console.error(err)
      }
    })
  }
)

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
