import unittest
import numpy as np
from detector import Detector
I=(300.,300.,159.5,119.5)
class Tests(unittest.TestCase):
 def setUp(self):
  self.d=Detector();self.wall=np.full((240,320),1000,dtype=np.float32);self.cal(self.wall)
 def cal(self,w):
  self.d.begin((.2,.2,.8,.8))
  for i in range(30):self.d.update(w,I,now=i*.1)
 def frame(self,g):
  x=self.wall.copy();x[90:145,130:190]-=g;return x
 def settle(self,f,t=10):
  for k in range(5):r=self.d.update(f,I,now=t+k*.1)
  return r
 def test_lifecycle_hysteresis(self):
  for t,g,s in [(10,80,'near'),(11,12,'contact_candidate'),(12,18,'contact_candidate'),(13,30,'near'),(14,0,'away')]:self.assertEqual(self.settle(self.frame(g),t)['state'],s)
 def test_debounce(self):
  self.assertNotEqual(self.d.update(self.frame(12),I,now=10)['state'],'contact_candidate')
  self.assertEqual(self.settle(self.wall,11)['state'],'away')
 def test_missing(self):
  self.settle(self.frame(12));r=self.settle(np.zeros_like(self.wall),11);self.assertEqual(r['state'],'unknown');self.assertIsNone(r['gap_mm'])
 def test_noise(self):
  self.assertEqual(self.settle(self.wall+np.random.default_rng(42).normal(0,1,self.wall.shape))['state'],'away')
 def test_speckles(self):
  x=self.wall.copy();x[100:103,100:103]-=12;self.assertEqual(self.settle(x)['state'],'away')
 def test_plane_movement(self):
  self.assertEqual(self.settle(self.wall-70)['state'],'unknown')
 def test_bad_calibration(self):
  self.cal(np.zeros_like(self.wall));self.assertIsNone(self.d.plane)
 def test_tilt(self):
  y,x=np.indices(self.wall.shape);n=np.array([.2,0,1.]);n/=np.linalg.norm(n);denom=n[0]*(x-I[2])/I[0]+n[2];dep=(1000/denom).astype(np.float32);self.cal(dep)
  near=dep.copy();near[90:145,130:190]-=50/denom[90:145,130:190];self.assertAlmostEqual(self.settle(near)['gap_mm'],50,places=0)
 def test_multiple_regions_and_attached_near_patch(self):
  frame=self.wall.copy()
  frame[65:180,85:125]-=180
  frame[105:130,125:180]-=100
  frame[96:142,180:207]-=20
  frame[65:95,215:245]-=35
  r=self.settle(frame)
  self.assertTrue(r['diagnostic_valid'])
  self.assertEqual(len(r['regions']),2)
  self.assertEqual(len(r['near_regions']),2)
  self.assertEqual(sorted(x['gap_mm'] for x in r['near_regions']),[20,35])
  for region in r['regions']+r['near_regions']:
   self.assertTrue(all(0<=x<=1 and 0<=y<=1 for x,y in region['contour']))
 def test_regions_clear_on_missing_and_reset(self):
  self.assertTrue(self.settle(self.frame(20))['near_regions'])
  r=self.settle(np.zeros_like(self.wall),11)
  self.assertEqual(r['regions'],[])
  self.assertEqual(r['near_regions'],[])
  self.d.reset()
  self.assertEqual(self.d.update(self.wall,I)['regions'],[])
 def test_far_body_not_near_wall(self):
  r=self.settle(self.frame(400))
  self.assertEqual(len(r['regions']),1)
  self.assertEqual(r['near_regions'],[])
 def test_occlusion_invalidates_regions(self):
  r=self.settle(self.wall-100)
  self.assertFalse(r['diagnostic_valid'])
  self.assertEqual(r['state'],'unknown')
 def test_near_band_and_noise(self):
  self.assertEqual(self.settle(self.frame(55))['near_regions'],[])
  self.assertEqual(self.settle(self.frame(3),11)['regions'],[])
 def test_fixed_wall_bump_is_background_but_new_hand_remains(self):
  wall=self.wall.copy();wall[90:145,130:190]-=14
  self.cal(wall)
  r=self.settle(wall)
  self.assertEqual(r['regions'],[])
  self.assertEqual(r['near_regions'],[])
  hand=wall.copy();hand[100:130,140:180]-=12
  r=self.settle(hand,11)
  self.assertEqual(len(r['near_regions']),1)
  self.assertAlmostEqual(r['near_regions'][0]['gap_mm'],12,places=0)
  self.assertEqual(r['state'],'contact_candidate')
  self.assertEqual(len(self.settle(hand,100)['near_regions']),1)
  self.assertEqual(self.settle(wall,101)['near_regions'],[])
 def test_reference_holes_do_not_become_objects(self):
  wall=self.wall.copy();wall[100:120,130:150]=0
  self.cal(wall)
  frame=self.wall.copy();frame[100:120,130:150]-=20
  self.assertEqual(self.settle(frame)['regions'],[])
 def test_local_noise_is_not_global_hand_threshold(self):
  self.d.begin((.2,.2,.8,.8))
  for i in range(30):
   wall=self.wall.copy();wall[70:90,90:120]+=2 if i%2 else -2
   self.d.update(wall,I,now=i*.1)
  frame=self.wall.copy();frame[70:90,90:120]-=7
  self.assertEqual(self.settle(frame)['regions'],[])
  frame[100:130,140:180]-=12
  self.assertEqual(len(self.settle(frame,11)['near_regions']),1)
 def test_resolution_change_requires_calibration(self):
  r=self.d.update(self.wall[:120],I)
  self.assertEqual(r['state'],'uncalibrated')
  self.assertEqual(r['regions'],[])
 def test_reset(self):
  self.settle(self.frame(12));self.d.reset();r=self.d.update(self.wall,I);self.assertEqual(r['state'],'uncalibrated');self.assertIsNone(r['position'])
if __name__=='__main__':unittest.main()
