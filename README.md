# Sky & Salah — Weather and Prayer Times Dashboard

A responsive weather dashboard that integrates live meteorological forecasts with accurate Islamic prayer timings for global locations. The dynamic visual interface features weather-reactive background canvas animations representing diverse atmospheric conditions, including clear skies, clouds, precipitation, fog, and electrical storms.

**Live demo:** https://weather-forecast-pro.onrender.com/

## Key Features

- **Real-Time Meteorology**: Delivers current environmental metrics, including ambient temperature, apparent temperature, relative humidity, wind speed, and precipitation probability for searched locations.
- **Extended Forecasting**: Provides comprehensive 7-day meteorological forecast data.
- **Prayer Timings Integration**: Calculates daily timings for Fajr, Dhuhr, Asr, Maghrib, and Isha, accompanied by a dynamic countdown to the upcoming prayer and a progress indicator monitoring the current prayer interval.
- **Dual Calendar Display**: Synchronizes Gregorian dates with corresponding Islamic Hijri date indicators.
- **Reactive Visual Environment**: Renders animated canvas elements—such as solar glows, lunar phases, starry night skies, precipitation, and fog—based on live atmospheric data and local time of day.
- **Geolocation Services**: Automatically resolves user coordinates upon application load, supported by manual city search capabilities.
- **Unit Preferences**: Implements a persistent Celsius and Fahrenheit temperature conversion toggle.
- **User Experience Enhancements**: Incorporates loading skeletons, notification toasts, and reduced-motion accessibility accommodations.

## Technology Stack

Built using standard vanilla web technologies—HTML5, CSS3, and modern JavaScript—requiring no complex build steps, package managers, or external framework dependencies.

**Integrated Public APIs:**

- **Open-Meteo**: Utilized for meteorological forecasts and geographic coordinate resolution.
- **Al Adhan**: Utilized for Islamic prayer time calculations and Hijri calendar data.
- **BigDataCloud**: Utilized for reverse geocoding to support automated location detection.

## Local Execution

Because the application consists entirely of static assets, no compilation or software installation is required.

Clone the repository and access the project directory:

```bash
git clone https://github.com/Hassan-Shahzad2/Weather_Forecast_Pro.git
cd Weather_Forecast_Pro
```

To run the application, open the `index.html` file directly in any modern web browser, or initiate a local HTTP server:

```bash
python3 -m http.server 8000
```

Access the local instance by navigating to `http://localhost:8000`.

## Deployment

Designed as a static web application, the project can be deployed seamlessly across static hosting providers such as Render, GitHub Pages, Netlify, or Vercel. The deployment process requires no environment variables or build commands, with the publication root mapped directly to the repository base.

## Project Structure

```text
├── index.html
├── style.css
├── script.js
├── favicon.svg / favicon.ico / favicon-*.png
├── apple-touch-icon.png
├── android-chrome-*.png
└── site.webmanifest
```

## License

This project is made available for educational and developmental purposes.
