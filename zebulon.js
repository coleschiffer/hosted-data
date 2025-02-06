const moment = require('moment-timezone');
const puppeteer = require('puppeteer');
const fetch = (...args) =>
	import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');
scrapeData()

const locationURL = 'https://dice.fm/venue/zebulon-y8bv';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(page, url, maxRetries = 3, baseDelay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Navigate to the URL with networkidle2 wait condition
            await page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 // 30 second timeout
            });

            // Wait for the body to ensure content is loaded
            await page.waitForSelector('body');

            // Extract the page content
            const pageContent = await page.evaluate(() => document.body.innerHTML);
            const listings = getShowtimes(pageContent);



            const location = {
                '@type': 'Place',
                '@id': locationURL,
                name: 'Zebulon',
                url: 'https://zebulon.la/',
                description: '',
                geo: {
                    "@type": "GeoCoordinates",
                    latitude: 34.1071962, 
                    longitude: -118.2547398,
                },
                address: {
                    "@type": "PostalAddress",
                    streetAddress: "2478 Fletcher Drive",
                    addressLocality: "Los Angeles",
                    addressRegion: "CA",
                    postalCode: 90039,
                    addressCountry: "US"
                },
            }

            if(listings.length > 0) {
                return {
                    "@context": "https://schema.org",
                    "@graph": [
                        ...listings,
                        location
                    ]
                }
            }
            
            return listings; // Success! Return the data

        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error.message);

            if (attempt === maxRetries) {
                throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
            }

            // Calculate exponential backoff delay
            const backoffDelay = baseDelay * Math.pow(2, attempt - 1);
            // Add some random jitter
            const jitter = Math.random() * 1000;
            const totalDelay = backoffDelay + jitter;

            console.log(`Waiting ${Math.round(totalDelay/1000)} seconds before retry...`);
            await delay(totalDelay);
        }
    }
}

async function scrapeData() {
    try {
        // Launch Puppeteer in non-headless mode
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();


    const url = locationURL;


    const listings = await fetchWithRetry(page, url);

   // console.log('Successfully fetched listings:', listings);


        // Save the structured data to a file (data.txt)
        fs.writeFileSync('zebulon.json', JSON.stringify(listings, null, 2));


/*
        console.log('Response:', response.status, response.statusText);
        console.log('Data sent to Zeitgeist API');
*/
        // Close the browser
        await browser.close();
    } catch (error) {

        console.error('An error occurred:', error);
    }
}


// Function to parse showtimes from the page content
function getShowtimes(text) {
    const nextDataIndex = text.search('__NEXT_DATA__');
    let cleaned = text.substring(nextDataIndex);
    cleaned = cleaned.substring(cleaned.indexOf('{"props"'));
    cleaned = cleaned.substring(0, cleaned.indexOf('</script>'));
    cleaned = JSON.parse(cleaned);

    const events = cleaned.props.pageProps.profile.sections[0].events;
    let listings = [];
    for (const event of events) {
        const listing = createListing(event);
        listings.push(listing);
    }
    return listings;
}

function createListing(blob) {

    let type = blob.tags_types[0].name;
    if(type === 'film') {
        type = 'ScreeningEvent'
    } else if (type === 'talks') {
        type = 'EducationEvent'
    } else if (type === 'gig') {
        type = 'MusicEvent'
    }
    let description = blob.about.description;
    let year = '';
    let runTime;
    if (description.search(/· \d+' ·/) > 0) {
        runTime = description.search(/· \d+' ·/);
        runTime = description.substring(runTime+2);
        runTime = runTime.substring(0,runTime.indexOf("'"));
    }
       const startDate = moment.tz(blob.dates.event_start_date.substring(0,19), "YYYY-MM-DDTHH:mm:ss", "America/Los_Angeles").utc().toISOString();
       const endDate = moment.tz(blob.dates.event_end_date.substring(0,19), "YYYY-MM-DDTHH:mm:ss", "America/Los_Angeles").utc().toISOString();

    let name = blob.name;
    if(blob.name.indexOf('SCREENING:')!=-1) {
        name = name.substring(11);
    }
    let QA = false;
    let workPresented = [];
    let series = {title:blob.presented_by};
    if(type === 'ScreeningEvent') {
        let videoFormat = (/DCP|70mm|35mm|16mm/).exec(blob.about.description);
        videoFormat = videoFormat ? videoFormat[0] : '';
        let director = ''
        if(description.indexOf('Director: ') > 0) {
            director = description.indexOf('Director: ');
            director = description.substring(director);
            director = director.substring(director.indexOf(':') + 2, director.indexOf(' ·'));
            if(description.search(/[12][098]\d\d/) > 0) {
                year = description.search(/[12][098]\d\d/);
                year = description.substring(year, year+4);
            }
        }
        if(description.indexOf('Directors: ') > 0) {
            director = description.indexOf('Directors: ');
            director = description.substring(director);
            director = director.substring(director.indexOf(':') + 2, director.indexOf(' ·'));
            director = director.replace('and','&amp;');
            if(description.search(/[12][098]\d\d/) > 0) {
                year = description.search(/[12][098]\d\d/);
                year = description.substring(year, year+4);
            }
        }
            const pattern = /\(Dir\. ([A-Za-z\s]+), (\d{4})\)/g;
    
                let match;
                while ((match = pattern.exec(description)) !== null) {
                 director = match[1];
                 year = match[2];
    
                }
            let QA = false;
            if (description.includes('Q&A')||description.includes('In person:')||description.includes('in person')) {
                QA = true;
            }
        
        if(blob.presented_by.indexOf('Mezzanine') > 0) {
            let tag = description.substring(description.indexOf('('));
            tag = tag.substring(0,tag.indexOf(')'));
            if(tag.search(/[12][098]\d\d/) >= 0) {
                year = (/[12][098]\d\d/).exec(tag)[0];
            }
            if(tag.search(/DCP|70mm|35mm|16mm/) > 0) {
                 videoFormat = (/DCP|70mm|35mm|16mm/).exec(tag)[0];
            }
            if(tag.search(/\d*\d\dm/) > 0) {
                 runTime = (/\d*\d\dm/).exec(tag)[0];
                runTime = runTime.substring(0,(runTime.length-1));
                runTime = parseInt(runTime);
            }
        }
        workPresented = [{
            name,
            duration: runTime,
            director,
            year,
            videoFormat
        }];

    }
   
   
    return {
        '@context': 'https://schema.org',
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        '@type': type,
        startDate,
        endDate,
        '@id':  blob.social_links.event_share,
        url: blob.social_links.event_share,
        "location": {
        "@type": "Place",
        "@id": locationURL
      },
        ...(blob.images.square && 
            {image: {
                "@type": "ImageObject",
                url: blob.images.square
              }}),
        name,
        description,
        ...(type === 'ScreeningEvent' && {
            workPresented
        })
    };
    
}


