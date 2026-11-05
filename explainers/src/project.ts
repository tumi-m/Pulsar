import {makeProject} from '@motion-canvas/core';

// The <motion-canvas-player> element travels inside this module rather than
// as a second file next to it. The app then has exactly one URL to fetch, and
// one to fetch again: browsers remember a failed module import for the life
// of the page, so a retry only works under a fresh URL, and a core chunk
// shared by two files would have had a URL no retry could change.
import './player';

import howSamplingWorks from './scenes/how-sampling-works?scene';

export default makeProject({
  scenes: [howSamplingWorks],
});
