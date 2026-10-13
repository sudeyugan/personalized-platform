# Local Face Landmarker

Model bundle version1, official pinned URL:
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

The model is bundled locally, not downloaded at runtime. SHA-256 and byte size
are fixed in the worker asset manifest after the verified-TLS download.
JavaScript/WASM use the exact `@mediapipe/tasks-vision@1.1.0` dependency; build
imports only local package assets, with no CDN or dynamic remote script.

Google's model cards explicitly license each bundled model under Apache2.0:

- [BlazeFace short range](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf)
- [Face Mesh V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf)
- [Blendshape V2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf)

Copyright MediaPipe Authors/Google. See accompanying Apache2.0 license.
This integration does not use blendshapes to infer emotions or identity. It only
uses transient local face presence/position/relative size/head orientation;
multiple faces are not automatically chosen. All frames/meshes stay in local
capture/Worker memory and are released, never saved or sent to an AI provider.
