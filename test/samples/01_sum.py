# 1 から n までの和を求め、偶奇を表示する
n = int(input())
s = 0
i = 1
while i <= n:
    s = s + i      # 累積
    i = i + 1
if s % 2 == 0:
    print("偶数", s)
else:
    print("奇数", s)
