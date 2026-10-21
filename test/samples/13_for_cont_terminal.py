def f(L):
    for x in L:
        if x < 0:
            continue
        return x
    return -1
