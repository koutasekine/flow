n = int(input())
s = 0
i = 1
for x in L:
    x = 0
while i <= n:
    s = s + i      # 累積
    i = i + 1
if s % 2 == 0:
    print("偶数", s)
else:
    print("奇数", s)
