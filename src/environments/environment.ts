// Used by `npm start`. The API is assumed to run on the same machine as the dev server
// (port 3000), so opening the app from a phone via http://<your-pc-ip>:4200 also works.
export const environment = {
  apiUrl: `http://${window.location.hostname}:3000/api`,
};
