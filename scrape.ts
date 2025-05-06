import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

async function scrapeInstagramPost(postUrl: string): Promise<void> {
  console.log(`Starting to scrape images from: ${postUrl}`);
  const browser = await puppeteer.launch({
    headless: true, // Set to true for running without UI
    defaultViewport: null
  });

  try {
    const page = await browser.newPage();

    // Set a user agent to appear more like a regular browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');

    // Navigate to the post
    await page.goto(postUrl, { waitUntil: 'networkidle2' });
    console.log('Page loaded');

    // Get the total number of images in the post
    const totalImages = await page.evaluate(() => {
      // Look for carousel indicators
      const indicators = document.querySelectorAll('div._acnb'); // This selector might change
      if (indicators.length > 0) {
        return indicators.length;
      }
      // If no indicators are found, look for the dots showing multiple images
      const dots = document.querySelectorAll('div._ae5q span._aamh');
      if (dots.length > 0) {
        return dots.length;
      }

      // If neither are found, it's probably a single image post
      return 1;
    });

    console.log(`Found ${totalImages} images in this post`);

    // Create directory for saving images
    const postId = postUrl.split('/p/')[1].split('/')[0];
    const downloadDir = path.join(__dirname, 'instagram_images', postId);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // Loop through all images in the post
    for (let i = 1; i <= totalImages; i++) {
      // Navigate to specific image in the carousel
      const imageUrl = `${postUrl}?img_index=${i}`;
      console.log(`Navigating to image ${i}/${totalImages}: ${imageUrl}`);

      await page.goto(imageUrl, { waitUntil: 'networkidle2' });

      // Extract the image URL - trying multiple selectors as Instagram's structure changes often
      const imgSrc = await page.evaluate(() => {
        // Try different selectors that might contain the image
        const selectors = [
          'img.x5yr21d', // Main post image selector
          'img[class*="x5yr21d"]', // Using partial class match
          'div._aagv img', // Another possible selector
          'article img' // Very generic fallback
        ];

        for (const selector of selectors) {
          const img = document.querySelector(selector);
          if (img && img.getAttribute('src')) {
            return img.getAttribute('src');
          }
        }

        // Last resort: grab all images and take the largest one (likely the post image)
        const allImgs = Array.from(document.querySelectorAll('img'));
        if (allImgs.length > 0) {
          // Sort by approximate size (width × height) and get the largest
          const sorted = allImgs.sort((a, b) => {
            const aSize = (a.naturalWidth || a.width || 0) * (a.naturalHeight || a.height || 0);
            const bSize = (b.naturalWidth || b.width || 0) * (b.naturalHeight || b.height || 0);
            return bSize - aSize;
          });
          // Skip profile pictures and icons (usually small)
          for (const img of sorted) {
            const src = img.getAttribute('src');
            if (src && !src.includes('profile_pic')) {
              return src;
            }
          }
          return sorted[0].getAttribute('src');
        }

        return null;
      });

      if (imgSrc) {
        console.log(`Found image URL: ${imgSrc}`);

        try {
          // Download the image
          const imagePath = path.join(downloadDir, `image_${i}.jpg`);
          await downloadImage(imgSrc, imagePath);
          console.log(`Saved image ${i} to: ${imagePath}`);
        } catch (error) {
          console.error(`Failed to download image ${i}:`, error);
        }
      } else {
        console.error(`Failed to extract URL for image ${i}`);
      }
    }

    console.log(`Successfully scraped ${totalImages} images from ${postUrl}`);

  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await browser.close();
  }
}

async function downloadImage(url: string, destination: string): Promise<void> {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
    }
  });

  const writer = fs.createWriteStream(destination);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Execute the scraper
const targetPost = 'https://www.instagram.com/p/DEcJnGDPT7r2C97Jzh6XAcYmxrAM2uTyTkvLrw0/';
scrapeInstagramPost(targetPost)
  .then(() => console.log('Scraping completed'))
  .catch(err => console.error('Scraping failed:', err));