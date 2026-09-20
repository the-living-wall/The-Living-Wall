"""Geometric foreground proximity, not hand recognition or certified touch sensing."""
import time
import numpy as np
import cv2


def points(depth, intrinsics):
    fx, fy, cx, cy = intrinsics
    y, x = np.indices(depth.shape)
    return np.stack(((x-cx)*depth/fx, (y-cy)*depth/fy, depth), axis=-1)


def measure_patch(depth, reference, reference_valid, intrinsics, normal, roi):
    """Fixed central patch; no foreground, near-band, or positive-gap selection.

    Signed displacement along the wall normal from the frozen per-pixel wall.
    This estimates visible-surface separation, never hidden physical contact.
    """
    h, w = depth.shape
    x0,y0,x1,y1 = roi
    cx,cy=(x0+x1)/2,(y0+y1)/2
    rx,ry=(x1-x0)*.06,(y1-y0)*.06
    bounds=[cx-rx,cy-ry,cx+rx,cy+ry]
    mask=np.zeros(depth.shape,bool)
    mask[int(bounds[1]*h):int(bounds[3]*h),int(bounds[0]*w):int(bounds[2]*w)] = True
    valid=mask & reference_valid & np.isfinite(depth) & (depth>100) & (depth<5000)
    count=int(valid.sum());total=int(mask.sum())
    result=dict(bounds=bounds, valid_pixels=count, total_pixels=total,
                valid_ratio=round(count/max(total,1),3), signed_gap_mm=None,
                spread_p10_p90_mm=None, camera_z_mm=None,
                quantity='visible_surface_normal_displacement', selection='fixed_patch_unfiltered')
    if count < 20 or count < total*.8:
        return result
    gap=((reference-points(depth,intrinsics)) @ normal)[valid]
    result.update(signed_gap_mm=round(float(np.median(gap)),2),
                  spread_p10_p90_mm=[round(float(v),2) for v in np.percentile(gap,[10,90])],
                  camera_z_mm=round(float(np.median(depth[valid])),2))
    return result


class Detector:
    def __init__(self):
        self.reset()

    def reset(self):
        self.plane = None
        self.reference = None
        self.reference_valid = None
        self.local_floor = None
        self.intrinsics = None
        self.collect = []
        self.calibrating = False
        self.roi = (0.2, 0.2, 0.8, 0.8)
        self.state = 'uncalibrated'
        self.pending = None
        self.since = 0
        self.previous_time = None
        self.noise = 2.0
        self.error = ''

    def begin(self, roi):
        self.reset()
        self.roi = tuple(roi)
        self.calibrating = True

    def mask(self, shape):
        h, w = shape
        x0, y0, x1, y1 = self.roi
        m = np.zeros(shape, bool)
        m[int(y0*h):int(y1*h), int(x0*w):int(x1*w)] = True
        return m

    def calibrate(self, intrinsics):
        stack = np.stack(self.collect)
        valid = (stack > 100) & (stack < 5000) & np.isfinite(stack)
        # Require consistent depth in at least 90% of collected frames.
        coverage = valid.mean(axis=0) >= .9
        median = np.ma.median(np.ma.array(stack, mask=~valid), axis=0).filled(0)
        roi = self.mask(median.shape)
        usable = coverage & roi
        if usable.sum() < roi.sum()*.85 or usable.sum() < 200:
            raise ValueError('有效深度不足：请调整距离、角度，确保框内是空的平整表面。')
        jitter = np.median(np.abs(stack[:, usable] - median[usable]))
        if jitter > 5:
            raise ValueError('校准期间画面不稳定：固定相机，移开手后重试。')
        cloud = points(median, intrinsics)[usable][::3]
        sample = cloud
        for _ in range(3):
            centre = sample.mean(axis=0)
            _, _, vh = np.linalg.svd(sample-centre, full_matrices=False)
            normal = vh[-1]
            if normal[2] < 0:
                normal = -normal
            offset = -normal @ centre
            residual = np.abs(cloud @ normal + offset)
            sample = cloud[residual < max(6, np.percentile(residual, 75)*2)]
            if len(sample) < 100:
                raise ValueError('未找到稳定平面。')
        residual = np.abs(cloud @ normal + offset)
        if np.percentile(residual, 90) > 15 or abs(normal[2]) < .35:
            raise ValueError('框内不够平整或观察角度过斜，请重新选区。')
        # Frozen per-pixel empty-wall reference. Fixed wall curvature/bias must
        # not be treated as new objects. Never adapt while a hand is present.
        reference_cloud = points(median, intrinsics)
        y, x = np.indices(median.shape)
        fx, fy, cx, cy = intrinsics
        ray_normal = normal[0]*(x-cx)/fx + normal[1]*(y-cy)/fy + normal[2]
        deviation = np.abs(stack-median) * np.abs(ray_normal)
        spread = np.ma.median(np.ma.array(deviation, mask=~valid), axis=0).filled(np.inf)
        self.local_floor = np.maximum(5., 4.5*spread)
        self.reference_valid = usable & (self.local_floor < 15)
        if self.reference_valid.sum() < roi.sum()*.85:
            self.reference_valid = None
            raise ValueError('空墙局部波动过大：请固定相机、移开物体后重新校准。')
        self.reference = reference_cloud
        self.intrinsics = tuple(intrinsics)
        self.noise = max(2, float(np.median(spread[self.reference_valid])))
        self.plane = (normal, offset)
        self.state = 'away'

    def regions(self, mask, gap):
        """Per-frame geometry only: numbers are not persistent object identities."""
        clean = cv2.morphologyEx(mask.astype('uint8'), cv2.MORPH_OPEN,
                                 np.ones((3, 3), np.uint8))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(clean)
        h, w = gap.shape
        items = []
        for label in sorted(range(1, count), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:12]:
            area = int(stats[label, cv2.CC_STAT_AREA])
            if area < 35:
                continue
            component = (labels == label).astype('uint8')
            contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            contour = cv2.approxPolyDP(max(contours, key=cv2.contourArea), 1.5, True)
            values = gap[labels == label]
            yy, xx = np.nonzero(component)
            items.append(dict(center=[round(float(xx.mean())/w,4),round(float(yy.mean())/h,4)], area_px=area, gap_mm=round(float(np.percentile(values, 20)), 1),
                              median_mm=round(float(np.median(values)), 1),
                              contour=[[round(float(x)/w, 4), round(float(y)/h, 4)]
                                       for x, y in contour[:, 0]]))
        return items

    def update(self, depth, intrinsics, now=None, contact=15):
        now = time.monotonic() if now is None else now
        roi = self.mask(depth.shape)
        valid = (depth > 100) & (depth < 5000) & np.isfinite(depth)
        result = dict(state=self.state, gap_mm=None, position=None, progress=0,
                      regions=[], near_regions=[], valid_ratio=round(float((valid & roi).sum()/max(1,roi.sum())), 3),
                      background_model="pixel-wall-v2", near_mm=50, diagnostic_valid=False, message=self.error, contact_mm=contact, noise_mm=round(self.noise, 1))
        if self.calibrating:
            self.collect.append(depth.copy())
            result.update(state='calibrating', progress=len(self.collect)/30)
            if len(self.collect) >= 30:
                try:
                    self.calibrate(intrinsics)
                    result.update(state='away', message='空墙背景已记住。先观察空墙是否为零，再伸入手掌。')
                except ValueError as exc:
                    self.error = str(exc)
                    result.update(state='uncalibrated', message=self.error)
                self.collect.clear()
                self.calibrating = False
            return result
        if self.plane is None:
            return result
        if depth.shape != self.reference_valid.shape or tuple(intrinsics) != self.intrinsics:
            self.reset()
            return dict(result, state='uncalibrated', message='深度尺寸或内参改变，请重新校准空墙。')
        result['measurement'] = measure_patch(depth, self.reference, self.reference_valid, intrinsics, self.plane[0], self.roi)
        known = valid & roi & self.reference_valid
        if known.sum() < roi.sum()*.65:
            self.pending = None
            self.state = 'unknown'
            return dict(result, state='unknown', message='深度缺失，无法判断接触。')
        normal, offset = self.plane
        gap = (self.reference - points(depth, intrinsics)) @ normal
        floor = max(5, self.noise*3)
        # Stationary background must still agree with the calibrated plane.
        background = known & (np.abs(gap) <= self.local_floor)
        # A wide presence band includes forearms/torso; near-wall patches are
        # segmented separately, even when attached to a much larger component.
        foreground_mask = known & (gap > self.local_floor) & (gap < 800)
        result.update(regions=self.regions(foreground_mask, gap),
                      near_regions=self.regions(foreground_mask & (gap <= 50), gap),
                      background_ratio=round(float(background.sum()/max(1,roi.sum())), 3),
                      diagnostic_valid=True)
        if background.sum() < roi.sum()*.35:
            self.pending = None
            self.state = 'unknown'
            return dict(result, state='unknown', diagnostic_valid=False, message='平面被大面积遮挡或相机已移动，请移开物体；移动后重新校准。')
        foreground = (foreground_mask & (gap < 300)).astype('uint8')
        foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((3,3), np.uint8))
        n, labels, stats, centres = cv2.connectedComponentsWithStats(foreground)
        target = 'away'
        if n > 1:
            label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
            if stats[label, cv2.CC_STAT_AREA] >= 35:
                values = gap[labels == label]
                distance = float(np.percentile(values, 20))
                threshold = contact + (5 if self.state == 'contact_candidate' else 0)
                target = 'contact_candidate' if distance <= threshold else 'near'
                h,w=depth.shape
                result.update(gap_mm=round(distance,1), position=[float(centres[label,0]/w),float(centres[label,1]/h)])
        # Time-based debounce; no immediate contact from one noisy frame.
        if self.previous_time is not None and now-self.previous_time > .5:
            self.pending = None
        self.previous_time = now
        if self.pending != target:
            self.pending, self.since = target, now
        if now-self.since >= .15:
            self.state = target
        result.update(state=self.state, noise_mm=round(self.noise,1))
        if floor >= contact:
            result.update(state='unknown', diagnostic_valid=False, near_regions=[], message='噪声已接近接触阈值，请改善距离与角度后重新校准。')
        return result
