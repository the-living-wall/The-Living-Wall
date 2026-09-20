import unittest
import numpy as np
from detector import Detector
I=(300.,300.,159.5,119.5)
class MeasurementTests(unittest.TestCase):
 def detector(self, wall):
  d=Detector();d.begin((.2,.2,.8,.8))
  for i in range(30): d.update(wall,I,now=i*.1)
  return d
 def test_unfiltered_zero_negative_subthreshold_and_far(self):
  wall=np.full((240,320),1000.,dtype=np.float32);d=self.detector(wall)
  for gap in (0,-8,3,20,100):
   f=wall.copy();f[90:150,125:195]-=gap
   r=d.update(f,I,now=10)
   self.assertAlmostEqual(r['measurement']['signed_gap_mm'],gap,places=1)
 def test_tilted_wall_normal_offset(self):
  y,x=np.indices((240,320));n=np.array([.3,0,1]);n/=np.linalg.norm(n)
  ray=n[0]*(x-I[2])/I[0]+n[2];wall=(1000/ray).astype(np.float32)
  d=self.detector(wall);f=wall.copy();f[90:150,125:195]-=20/ray[90:150,125:195]
  self.assertAlmostEqual(d.update(f,I,now=10)['measurement']['signed_gap_mm'],20,places=1)
 def test_invalid_patch_never_reports_zero(self):
  wall=np.full((240,320),1000.,dtype=np.float32);d=self.detector(wall)
  f=wall.copy();f[90:150,125:195]=0
  self.assertIsNone(d.update(f,I,now=10)['measurement']['signed_gap_mm'])
