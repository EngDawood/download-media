import { snapsave } from "node_modules/snapsave-media-downloader";

const download = await snapsave("https://www.instagram.com/p/DUlNAWHlRXx/");

console.log(download);