(function () {
  "use strict";

  var canvas = document.getElementById("image-transport-canvas");
  var sourceImage = document.getElementById("transport-source-image");
  var targetImage = document.getElementById("transport-target-image");
  var sourceCaption = document.getElementById("transport-source-caption");
  var targetCaption = document.getElementById("transport-target-caption");

  if (!canvas || !sourceImage || !targetImage) return;

  var context = canvas.getContext("2d", {
    alpha: true,
    desynchronized: true
  });
  if (!context) return;

  var transportQuery = window.matchMedia("(min-width: 701px)");
  var mappingUrl = "/assets/data/image-transport-map.json";
  var ready = false;
  var frameRequested = false;
  var layout = null;
  var gridWidth = 0;
  var gridHeight = 0;
  var particleCount = 0;
  var targetIndexForSource = null;
  var sourceColours = null;
  var targetColours = null;
  var delay = null;
  var horizontalDrift = null;
  var dropScale = null;
  var phase = null;
  var resizeObserver = null;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function mix(start, end, amount) {
    return start + (end - start) * amount;
  }

  function smoothstep(start, end, value) {
    var amount = clamp((value - start) / (end - start), 0, 1);
    return amount * amount * (3 - 2 * amount);
  }

  function easeInOutCubic(value) {
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  }

  function randomFor(index, salt) {
    var value = Math.sin((index + 1) * (12.9898 + salt * 17.719)) * 43758.5453;
    return value - Math.floor(value);
  }

  function waitForImage(image) {
    if (image.complete && image.naturalWidth > 0) {
      if (typeof image.decode === "function") {
        return image.decode().catch(function () {
          return image;
        });
      }
      return Promise.resolve(image);
    }

    return new Promise(function (resolve, reject) {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
    });
  }

  function sampleColours(image, width, height) {
    var sampler = document.createElement("canvas");
    sampler.width = width;
    sampler.height = height;
    var samplerContext = sampler.getContext("2d", {
      alpha: false,
      willReadFrequently: true
    });
    samplerContext.drawImage(image, 0, 0, width, height);

    var pixels = samplerContext.getImageData(0, 0, width, height).data;
    var colours = new Uint8ClampedArray(width * height * 3);
    for (var pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      colours[pixelIndex * 3] = pixels[pixelIndex * 4];
      colours[pixelIndex * 3 + 1] = pixels[pixelIndex * 4 + 1];
      colours[pixelIndex * 3 + 2] = pixels[pixelIndex * 4 + 2];
    }
    return colours;
  }

  function validateTransportMap(data) {
    if (
      !data ||
      !Number.isInteger(data.gridWidth) ||
      !Number.isInteger(data.gridHeight) ||
      data.gridWidth < 2 ||
      data.gridHeight < 2 ||
      !Array.isArray(data.targetIndexForSource)
    ) {
      throw new Error("The image transport map is malformed.");
    }

    var expectedCount = data.gridWidth * data.gridHeight;
    if (data.targetIndexForSource.length !== expectedCount) {
      throw new Error("The image transport map has the wrong particle count.");
    }

    var seen = new Uint8Array(expectedCount);
    data.targetIndexForSource.forEach(function (targetIndex) {
      if (
        !Number.isInteger(targetIndex) ||
        targetIndex < 0 ||
        targetIndex >= expectedCount ||
        seen[targetIndex]
      ) {
        throw new Error("The image transport map is not a permutation.");
      }
      seen[targetIndex] = 1;
    });
  }

  function prepareParticles(data) {
    gridWidth = data.gridWidth;
    gridHeight = data.gridHeight;
    particleCount = gridWidth * gridHeight;
    targetIndexForSource = new Uint16Array(data.targetIndexForSource);
    sourceColours = sampleColours(sourceImage, gridWidth, gridHeight);
    targetColours = sampleColours(targetImage, gridWidth, gridHeight);
    delay = new Float32Array(particleCount);
    horizontalDrift = new Float32Array(particleCount);
    dropScale = new Float32Array(particleCount);
    phase = new Float32Array(particleCount);

    for (var index = 0; index < particleCount; index += 1) {
      var sourceRow = Math.floor(index / gridWidth);
      var rowAmount = sourceRow / Math.max(1, gridHeight - 1);
      delay[index] =
        ((1 - rowAmount) * 0.58 + randomFor(index, 1) * 0.42) * 0.085;
      horizontalDrift[index] = (randomFor(index, 2) - 0.5) * 150;
      dropScale[index] = 0.72 + randomFor(index, 3) * 0.48;
      phase[index] = randomFor(index, 4) * Math.PI * 2;
    }
  }

  function resizeCanvas() {
    var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
    var height = Math.max(1, Math.round(window.innerHeight * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function measure() {
    if (!ready) return;

    var sourceRect = sourceImage.getBoundingClientRect();
    var targetRect = targetImage.getBoundingClientRect();
    var pageX = window.scrollX || window.pageXOffset;
    var pageY = window.scrollY || window.pageYOffset;

    var sourceTop = sourceRect.top + pageY;
    var targetTop = targetRect.top + pageY;
    var transportDelay = clamp(window.innerHeight * 0.08, 64, 96);
    var baseStartScroll = Math.max(
      0,
      sourceTop - window.innerHeight * 0.34
    );
    var startScroll = baseStartScroll + transportDelay;
    var endScroll = Math.max(
      startScroll + 1,
      targetTop - window.innerHeight * 0.38 + transportDelay
    );

    layout = {
      sourceLeft: sourceRect.left + pageX,
      sourceTop: sourceTop,
      sourceWidth: sourceRect.width,
      sourceHeight: sourceRect.height,
      targetLeft: targetRect.left + pageX,
      targetTop: targetTop,
      targetWidth: targetRect.width,
      targetHeight: targetRect.height,
      startScroll: startScroll,
      endScroll: endScroll,
      viewportHeight: window.innerHeight
    };

    resizeCanvas();
    requestRender();
  }

  function progressForScroll() {
    if (!layout) return 0;
    return clamp(
      ((window.scrollY || window.pageYOffset) - layout.startScroll) /
        (layout.endScroll - layout.startScroll),
      0,
      1
    );
  }

  function setImageOpacity(sourceOpacity, targetOpacity) {
    var safeSourceOpacity = String(clamp(sourceOpacity, 0, 1));
    var safeTargetOpacity = String(clamp(targetOpacity, 0, 1));
    sourceImage.style.opacity = safeSourceOpacity;
    targetImage.style.opacity = safeTargetOpacity;
    if (sourceCaption) sourceCaption.style.opacity = safeSourceOpacity;
    if (targetCaption) targetCaption.style.opacity = safeTargetOpacity;
  }

  function clearCanvas() {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function renderStatic() {
    document.body.classList.remove("image-transport-active");
    clearCanvas();
    setImageOpacity(1, 1);
  }

  function renderParticles(progress) {
    document.body.classList.add("image-transport-active");

    var sourceOpacity = 1 - smoothstep(0.015, 0.17, progress);
    var targetOpacity = smoothstep(0.82, 0.99, progress);
    setImageOpacity(sourceOpacity, targetOpacity);
    clearCanvas();

    var canvasOpacity =
      smoothstep(0.01, 0.11, progress) *
      (1 - smoothstep(0.86, 0.995, progress));
    if (canvasOpacity <= 0.001) return;

    var pageX = window.scrollX || window.pageXOffset;
    var pageY = window.scrollY || window.pageYOffset;
    var sourceCellWidth = layout.sourceWidth / gridWidth;
    var sourceCellHeight = layout.sourceHeight / gridHeight;
    var targetCellWidth = layout.targetWidth / gridWidth;
    var targetCellHeight = layout.targetHeight / gridHeight;
    var colourAmount = smoothstep(0.5, 0.88, progress);
    var maximumDrop = Math.min(layout.viewportHeight * 0.28, 230);

    context.save();
    context.globalAlpha = canvasOpacity * 0.94;

    for (var index = 0; index < particleCount; index += 1) {
      var targetIndex = targetIndexForSource[index];
      var sourceColumn = index % gridWidth;
      var sourceRow = Math.floor(index / gridWidth);
      var targetColumn = targetIndex % gridWidth;
      var targetRow = Math.floor(targetIndex / gridWidth);

      var sourceX =
        layout.sourceLeft + (sourceColumn + 0.5) * sourceCellWidth;
      var sourceY =
        layout.sourceTop + (sourceRow + 0.5) * sourceCellHeight;
      var targetX =
        layout.targetLeft + (targetColumn + 0.5) * targetCellWidth;
      var targetY =
        layout.targetTop + (targetRow + 0.5) * targetCellHeight;

      var particleProgress = clamp(
        (progress - delay[index]) / (1 - delay[index]),
        0,
        1
      );
      var movement = easeInOutCubic(particleProgress);
      var arc = Math.sin(Math.PI * movement);
      var wave =
        Math.sin(phase[index] + movement * Math.PI * 2.25) * 14 * arc;
      var x =
        mix(sourceX, targetX, movement) +
        horizontalDrift[index] * arc +
        wave -
        pageX;
      var y =
        mix(sourceY, targetY, movement) +
        maximumDrop * dropScale[index] * arc -
        pageY;

      if (
        x < -10 ||
        x > window.innerWidth + 10 ||
        y < -10 ||
        y > window.innerHeight + 10
      ) {
        continue;
      }

      var sourceColourOffset = index * 3;
      var targetColourOffset = targetIndex * 3;
      var red = Math.round(
        mix(
          sourceColours[sourceColourOffset],
          targetColours[targetColourOffset],
          colourAmount
        )
      );
      var green = Math.round(
        mix(
          sourceColours[sourceColourOffset + 1],
          targetColours[targetColourOffset + 1],
          colourAmount
        )
      );
      var blue = Math.round(
        mix(
          sourceColours[sourceColourOffset + 2],
          targetColours[targetColourOffset + 2],
          colourAmount
        )
      );

      var sourceSize =
        Math.min(sourceCellWidth, sourceCellHeight) * 1.06;
      var targetSize =
        Math.min(targetCellWidth, targetCellHeight) * 1.06;
      var particleSize =
        mix(sourceSize, targetSize, movement) * (1 - arc * 0.32);

      context.fillStyle = "rgb(" + red + "," + green + "," + blue + ")";
      context.fillRect(
        x - particleSize / 2,
        y - particleSize / 2,
        particleSize,
        particleSize
      );
    }

    context.restore();
  }

  function render() {
    frameRequested = false;
    if (!ready || !layout) return;

    var progress = progressForScroll();
    if (transportQuery.matches) {
      renderParticles(progress);
    } else {
      renderStatic();
    }
  }

  function requestRender() {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(render);
  }

  function handleModeChange() {
    measure();
  }

  function handleResize() {
    measure();
  }

  Promise.all([
    fetch(mappingUrl, { cache: "force-cache" }).then(function (response) {
      if (!response.ok) {
        throw new Error("Could not load the image transport map.");
      }
      return response.json();
    }),
    waitForImage(sourceImage),
    waitForImage(targetImage)
  ])
    .then(function (results) {
      var data = results[0];
      validateTransportMap(data);
      prepareParticles(data);
      ready = true;
      measure();

      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(sourceImage);
        resizeObserver.observe(targetImage);
      }

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measure);
      }
    })
    .catch(function () {
      document.body.classList.remove("image-transport-active");
      sourceImage.style.opacity = "";
      targetImage.style.opacity = "";
      if (sourceCaption) sourceCaption.style.opacity = "";
      if (targetCaption) targetCaption.style.opacity = "";
      clearCanvas();
    });

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", handleResize, { passive: true });
  window.addEventListener("orientationchange", handleResize);
  window.addEventListener("pageshow", handleResize);
  window.addEventListener("hashchange", function () {
    window.requestAnimationFrame(measure);
  });

  if (typeof transportQuery.addEventListener === "function") {
    transportQuery.addEventListener("change", handleModeChange);
  } else if (typeof transportQuery.addListener === "function") {
    transportQuery.addListener(handleModeChange);
  }
})();
